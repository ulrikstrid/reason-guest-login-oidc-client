open Lwt.Infix;

Fmt_tty.setup_std_outputs();
Logs.set_level(Some(Logs.Info));
Logs.set_reporter(Logs_fmt.reporter());

Lwt.both(
  Http.Client.get(
    ~port=443,
    ~host=Sys.getenv("PROVIDER_HOST"),
    ~path="/.well-known/openid-configuration",
    (),
  ),
  Http.Client.post_json_string(
    ~port=443,
    ~host=Sys.getenv("CONTROLLER_HOST"),
    ~path="/api/login",
    {|{"username":"test","password":"test"}|},
  ),
)
>>= (
  (
    (discover_response, login_response): (
      Http.Client.response,
      Http.Client.response,
    ),
  ) => {
    open Http.Client;

    let login_headers =
      login_response.headers
      |> CCList.map(((name, value)) => name ++ "=" ++ value)
      |> CCString.concat(", ");

    Logs.app(m => m("Login response: %s", login_response.body));
    Logs.app(m => m("Login headers: %s", login_headers));
    let context = Oidc.Discover.from_string(discover_response.body);
    Http.Server.start(
      ~context,
      ~make_routes_callback=Library.Router.make_callback,
      (),
    );
  }
)
|> Lwt_main.run;