let make = (~httpImpl, ~context, ~req_uri, reqd) => {
  open Http.HttpImpl;
  open Lwt.Infix;
  open Context;

  Logs.app(m =>
    m(
      "Got to callback with uri: %s",
      Uri.query(req_uri) |> Uri.encoded_of_query,
    )
  );

  let code =
    Uri.get_query_param(req_uri, "code") |> CCOpt.get_or(~default="code");

  Logs.app(m => m("code: %s", code));

  let token_path =
    context.discovery.token_endpoint |> Uri.of_string |> Uri.path;

  let token_data =
    Printf.sprintf(
      "?grant_type=authorization_code&code=%s&redirect_uri=%s&client_id=%s&client_secret=%s",
      code,
      context.client.redirect_uri,
      context.client.id,
      Sys.getenv_opt("OIDC_SECRET") |> CCOpt.get_or(~default="secret"),
    );

  Logs.app(m =>
    m(
      "code-uri: %s%s%s",
      Sys.getenv("PROVIDER_HOST"),
      token_path,
      token_data,
    )
  );

  Http.Client.post_string(
    ~port=443,
    ~host=
      context.discovery.token_endpoint
      |> Uri.of_string
      |> Uri.host_with_default(~default=Sys.getenv("PROVIDER_HOST")),
    ~path=token_path,
    ~headers=[("Content-Type", "application/x-www-form-urlencoded")],
    token_data,
  )
  >>= (
    token_response => {
      Logs.app(m => m("token_response.body: %s", token_response.body));

      switch (context.get_session("cookie_key")) {
      | Some({auth_json, target_url, sitekey, _}) =>
        let payload = Yojson.Basic.to_string(auth_json);

        Http.Client.post_json_string(
          ~port=443,
          ~host=Sys.getenv("CONTROLLER_HOST"),
          ~path="/api/login",
          {|{"username":"test","password":"test"}|},
        )
        >>= (
          login_response => {
            let cookie_header =
              login_response.headers
              |> Http.Cookie.get_set_cookie_headers
              |> CCList.map(Http.Cookie.get_cookie)
              |> Http.Cookie.to_cookie_header;

            Http.Client.post_json_string(
              ~port=443,
              ~host=Sys.getenv("CONTROLLER_HOST"),
              ~path="/api/s/" ++ sitekey ++ "/cmd/stamgr",
              ~headers=[cookie_header],
              payload,
            )
            >>= (
              accept_device_response => {
                Logs.app(m =>
                  m("Accept device response: %s", accept_device_response.body)
                );

                Http.Client.get(
                  ~host=Sys.getenv("CONTROLLER_HOST"),
                  ~path="/logout",
                  ~headers=[cookie_header],
                  (),
                );
              }
            );
          }
        )
        >|= (
          logout_response => {
            Logs.app(m => m("Logout response: %s", logout_response.body));

            Http.Response.Redirect.make(
              ~httpImpl,
              ~targetPath=target_url,
              reqd,
            );
          }
        );
      | None =>
        Http.Response.Redirect.make(
          ~httpImpl,
          ~targetPath="www.google.com",
          reqd,
        )
        |> Lwt.return
      };
    }
  );
};