Lwt.bind(
  Http.Client.get(
    443,
    "eid-development.xenit.se",
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