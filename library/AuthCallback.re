let make = (~context, req_uri) => {
  open Lwt.Infix;
  open Context;

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

  Morph_client.handle(Morph.Request.make(context.discovery.jwks_uri))
  >>= (
    jwks_response =>
      Morph_client.handle(
        Morph.Request.make(
          ~meth=`POST,
          ~headers=[("Content-Type", "application/x-www-form-urlencoded")],
          ~read_body=() => Lwt.return(token_data),
          context.discovery.token_endpoint,
        ),
      )
      >>= (
        token_response => {
          let jwks_response_body =
            switch (jwks_response.body) {
            | `String(body) => body
            | _ => ""
            };
          let token_response_body =
            switch (token_response.body) {
            | `String(body) => body
            | _ => ""
            };
          let jwks = Jose.Jwks.from_string(jwks_response_body);
          token_response_body
          |> Yojson.Basic.from_string
          |> Yojson.Basic.Util.member("id_token")
          |> Yojson.Basic.Util.to_string
          |> Jose.Jwt.from_string
          |> CCResult.flat_map(Jose.Jwt.verify(~jwks=jwks.keys))
          |> Lwt_result.lift;
        }
      )
  )
  >>= (
    _valid_id_token => {
      // Logs.app(m => m("id_token: %s", Jose.Jwt.to_string(valid_id_token)));

      let state =
        Uri.get_query_param(req_uri, "state")
        |> CCOpt.get_or(~default="state");

      switch (context.get_session(state)) {
      | None =>
        Morph.Response.empty
        |> Morph.Response.unauthorized("no valid session")
      | Some({auth_json, target_url, sitekey, _}) =>
        let login_body =
          Printf.sprintf(
            {|{"username":"%s","password":"%s"}|},
            Sys.getenv("UNIFI_API_USERNAME"),
            Sys.getenv("UNIFI_API_PASSWORD"),
          );
        let login_url =
          Printf.sprintf(
            "https://%s/api/login",
            Sys.getenv("CONTROLLER_HOST"),
          );
        Morph.Request.make(
          ~meth=`POST,
          ~headers=[("Content-Type", "application/json")],
          ~read_body=() => Lwt.return(login_body),
          login_url,
        )
        |> Morph_client.handle
        >>= (
          login_response => {
            let cookie_header =
              login_response.headers
              |> Cookie.get_set_cookie_headers
              |> CCList.map(Cookie.get_cookie)
              |> Cookie.to_cookie_header;

            Morph.Request.make(
              ~meth=`POST,
              ~headers=[("Content-Type", "application/json"), cookie_header],
              ~read_body=
                () => Yojson.Basic.to_string(auth_json) |> Lwt.return,
              Printf.sprintf(
                "https://%s/api/s/%s/cmd/stamgr",
                Sys.getenv("CONTROLLER_HOST"),
                sitekey,
              ),
            )
            |> Morph_client.handle
            >>= (
              _accept_device_response => {
                Morph.Request.make(
                  ~headers=[cookie_header],
                  Printf.sprintf(
                    "https://%s/logout",
                    Sys.getenv("CONTROLLER_HOST"),
                  ),
                )
                |> Morph_client.handle;
              }
            );
          }
        )
        >>= (
          _logout_response => {
            Morph.Response.empty |> Morph.Response.redirect(target_url);
          }
        );
      };
    }
  );
};
