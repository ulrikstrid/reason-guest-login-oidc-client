let make = (~httpImpl, ~context, ~req_uri, ~sitekey, reqd) => {
  open Context;

  let cookie_key =
    Uuidm.v4_gen(Random.State.make_self_init(), ()) |> Uuidm.to_string;

  let nonce =
    Uuidm.v4_gen(Random.State.make_self_init(), ()) |> Uuidm.to_string;

  (
    switch (
      Uri.get_query_param(req_uri, "id"),
      Uri.get_query_param(req_uri, "url"),
    ) {
    | (Some(device_mac), Some(target_url)) =>
      let ap_mac =
        Uri.get_query_param(req_uri, "ap")
        |> (
          fun
          | Some(ap_mac) => `String(ap_mac)
          | None => `Null
        );

      let auth_json =
        `Assoc([
          ("cmd", `String("authorize-guest")),
          ("mac", `String(device_mac)),
          ("minutes", `Int(120)),
          ("ap_mac", ap_mac),
        ]);

      context.set_session(
        cookie_key,
        {auth_json, target_url, sitekey, nonce},
      );

      let paremeters =
        Oidc.Parameters.{
          response_type: ["code"],
          client: context.client,
          redirect_uri: Sys.getenv("OIDC_REDIRECT_URI"),
          scope: ["openid"],
          state: Some(cookie_key),
          nonce,
          claims: None,
          max_age: None,
          display: None,
          prompt: None,
        };

      let query = Oidc.Parameters.to_query(paremeters);

      Http.Response.Redirect.make(
        ~httpImpl,
        ~targetPath=context.discovery.authorization_endpoint ++ query,
        reqd,
      );
    | _ =>
      Http.Response.Text.make(~httpImpl, ~text="id or url not provided", reqd)
    }
  )
  |> Lwt.return;
};