let make_callback = (~httpImpl, ~context: unit => Context.t, reqd) => {
  open Http.HttpImpl;
  open Lwt.Infix;

  let req_uri = httpImpl.target |> Uri.of_string;
  let req_path = Uri.path(req_uri);
  let path_parts =
    CCString.split(~by="/", req_path) |> CCList.filter(s => s != "");

  Logs.info(m => m("Full target: %s", httpImpl.target));

  let ctx = context();

  switch (httpImpl.meth, path_parts) {
  | (_, ["success.txt"]) =>
    Http.Response.Text.make(~httpImpl, ~text="success", reqd) |> Lwt.return
  | (_, ["guest", "s", sitekey]) =>
    Logs.info(m => m("auth url: %s", ctx.discovery.authorization_endpoint));

    switch (
      Uri.get_query_param(req_uri, "id"),
      Uri.get_query_param(req_uri, "url"),
    ) {
    | (Some(device_mac), Some(target_url)) =>
      Logs.info(m => m("Device mac: %s", device_mac));
      Logs.info(m => m("Target url: %s", target_url));
      let ap_mac =
        Uri.get_query_param(req_uri, "ap")
        |> (
          fun
          | Some(ap_mac) => `String(ap_mac)
          | None => `Null
        );

      Http.Client.post_json_string(
        ~port=443,
        ~host=Sys.getenv("CONTROLLER_HOST"),
        ~path="/api/login",
        {|{"username":"test","password":"test"}|},
      )
      >>= (
        login_response => {
          let login_headers =
            login_response.headers
            |> CCList.map(((name, value)) => name ++ "=" ++ value)
            |> CCString.concat(", ");

          Logs.app(m => m("Login response: %s", login_response.body));
          Logs.app(m => m("Login headers: %s", login_headers));

          let payload =
            `Assoc([
              ("cmd", `String("authorize-guest")),
              ("mac", `String(device_mac)),
              ("minutes", `Int(120)),
              ("ap_mac", ap_mac),
            ])
            |> Yojson.Basic.to_string;

          Logs.app(m => m("Accepy payload: %s", payload));

          let cookie_header =
            login_response.headers
            |> Http.Cookie.get_set_cookie_headers
            |> CCList.map(Http.Cookie.get_cookie)
            |> Http.Cookie.to_cookie_header;

          Logs.app(m => m("Sitekey: %s", sitekey));
          Logs.app(m =>
            m("Accept device url: %s", "/api/s/" ++ sitekey ++ "/cmd/stamgr")
          );

          Logs.app(m => m("cookie header: %s", snd(cookie_header)));

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
    | _ =>
      Http.Response.Text.make(~httpImpl, ~text="id or url not provided", reqd)
      |> Lwt.return
    };
  | (_, _) => Routes.FourOhFour.make(~httpImpl, reqd)
  };
};