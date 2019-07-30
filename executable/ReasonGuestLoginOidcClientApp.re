Fmt_tty.setup_std_outputs();
Logs.set_level(Some(Logs.Info));
Logs.set_reporter(Logs_fmt.reporter());

Lwt.bind(
  Http.Client.get(
    443,
    Sys.getenv("PROVIDER_HOST"),
    "/.well-known/openid-configuration",
  ),
  ({body, _}) => {
    let context = Oidc.Discover.from_string(body);
    Http.Server.start(
      ~context,
      ~make_routes_callback=Library.Router.make_callback,
      (),
    );
  },
)
|> Lwt_main.run;