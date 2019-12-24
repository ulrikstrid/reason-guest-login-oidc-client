let make = (state, request) => {
  let context = Context.get_context(request);

  let Context.{auth_json, sitekey, target_url, _} =
    CCOpt.get_exn(context.get_session(state));

  let login_body =
    Printf.sprintf(
      {|{"username":"%s","password":"%s"}|},
      Sys.getenv("UNIFI_API_USERNAME"),
      Sys.getenv("UNIFI_API_PASSWORD"),
    );

  let login_url =
    Printf.sprintf("https://%s/api/login", Sys.getenv("CONTROLLER_HOST"));

  let%lwt login_response =
    Morph.Request.make(
      ~meth=`POST,
      ~headers=[("Content-Type", "application/json")],
      ~read_body=() => Lwt.return(login_body),
      login_url,
    )
    |> Morph_client.handle;

  let cookie_header =
    login_response.headers
    |> Cookie.get_set_cookie_headers
    |> CCList.map(Cookie.get_cookie)
    |> Cookie.to_cookie_header;

  let%lwt _accept_device_response =
    Morph.Request.make(
      ~meth=`POST,
      ~headers=[("Content-Type", "application/json"), cookie_header],
      ~read_body=() => Yojson.Basic.to_string(auth_json) |> Lwt.return,
      Printf.sprintf(
        "https://%s/api/s/%s/cmd/stamgr",
        Sys.getenv("CONTROLLER_HOST"),
        sitekey,
      ),
    )
    |> Morph_client.handle;

  let%lwt _logout_response =
    Morph.Request.make(
      ~headers=[cookie_header],
      Printf.sprintf("https://%s/logout", Sys.getenv("CONTROLLER_HOST")),
    )
    |> Morph_client.handle;

  Morph.Response.empty |> Morph.Response.redirect(target_url);
};
