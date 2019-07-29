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