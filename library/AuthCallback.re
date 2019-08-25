let make = (~context, req_uri) => {
  open Lwt_result.Infix;
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

  Http.Client.fetch(context.discovery.jwks_uri)
  >>= (
    jwks_response =>
      Http.Client.fetch(
        ~meth=`POST,
        ~headers=[("Content-Type", "application/x-www-form-urlencoded")],
        ~body=token_data,
        context.discovery.token_endpoint,
      )
      >>= (
        token_response => {
          open Http.Client;

          let jwks = Jose.Jwks.from_string(jwks_response.body);
          token_response.body
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
    valid_id_token => {
      Logs.app(m => m("id_token: %s", Jose.Jwt.to_string(valid_id_token)));

      let state =
        Uri.get_query_param(req_uri, "state")
        |> CCOpt.get_or(~default="state");

      switch (context.get_session(state)) {
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
        Http.Client.fetch(
          ~meth=`POST,
          ~headers=[("Content-Type", "application/json")],
          ~body=login_body,
          login_url,
        )
        >>= (
          login_response => {
            let cookie_header =
              login_response.headers
              |> Http.Cookie.get_set_cookie_headers
              |> CCList.map(Http.Cookie.get_cookie)
              |> Http.Cookie.to_cookie_header;

            Http.Client.fetch(
              ~meth=`POST,
              ~headers=[("Content-Type", "application/json"), cookie_header],
              ~body=Yojson.Basic.to_string(auth_json),
              Printf.sprintf(
                "https://%s/api/s/%s/cmd/stamgr",
                Sys.getenv("CONTROLLER_HOST"),
                sitekey,
              ),
            )
            >>= (
              _accept_device_response => {
                Http.Client.fetch(
                  ~headers=[cookie_header],
                  Printf.sprintf(
                    "https://%s/logout",
                    Sys.getenv("CONTROLLER_HOST"),
                  ),
                );
              }
            );
          }
        )
        >>= (
          _logout_response => {
            let content_length = target_url |> String.length |> string_of_int;
            let headers = [
              ("content-length", content_length),
              ("location", target_url),
            ];

            Lwt_result.return(
              Http.Response.make(~status=`Code(303), ~headers, target_url),
            );
          }
        );
      | None => Lwt_result.fail(`Msg("Incorrect session value"))
      };
    }
  )
  |> (
    x =>
      Lwt.bind(x, result => {
        switch (result) {
        | Ok(res) => Lwt.return(res)
        | Error(`Msg(message)) => Http.Response.Unauthorized.make(message)
        }
      })
  );
};
