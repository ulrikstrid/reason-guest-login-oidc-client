let body_to_string =
  fun
  | `String(body) => body
  | _ => "";

let make = (req_uri, request) => {
  open Context;

  let context = Context.get_context(request);

  let code =
    Uri.get_query_param(req_uri, "code") |> CCOpt.get_or(~default="code");
  let token_data =
    Printf.sprintf(
      "grant_type=authorization_code&code=%s&redirect_uri=%s&client_id=%s&client_secret=%s",
      code,
      context.client.redirect_uri,
      context.client.id,
      Sys.getenv_opt("OIDC_SECRET") |> CCOpt.get_or(~default="secret"),
    );

  let%lwt jwks_response =
    Morph.Request.make(context.discovery.jwks_uri) |> Morph_client.handle;
  let%lwt token_response =
    Morph.Request.make(
      ~meth=`POST,
      ~headers=[("Content-Type", "application/x-www-form-urlencoded")],
      ~read_body=() => Lwt.return(token_data),
      context.discovery.token_endpoint,
    )
    |> Morph_client.handle;

  let jwks_response_body = body_to_string(jwks_response.body);
  let token_response_body = body_to_string(token_response.body);

  let jwks = Jose.Jwks.from_string(jwks_response_body);
  let _valid_token =
    token_response_body
    |> Yojson.Basic.from_string
    |> Yojson.Basic.Util.member("id_token")
    |> Yojson.Basic.Util.to_string
    |> Jose.Jwt.from_string
    |> CCResult.flat_map(Jose.Jwt.verify(~jwks=jwks.keys));

  let state =
    Uri.get_query_param(req_uri, "state") |> CCOpt.get_or(~default="state");

  // Validate that we have the session in store
  switch (context.get_session(state)) {
  | None =>
    Morph.Response.empty |> Morph.Response.unauthorized("no valid session")
  | Some(_) =>
    Morph.Response.empty
    |> Morph.Response.redirect(
         Sys.getenv("OIDC_REDIRECT_URI") ++ "/guest/redirect/" ++ state,
       )
  };
};
