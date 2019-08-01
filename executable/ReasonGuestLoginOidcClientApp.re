open Lwt.Infix;
open Library;

Fmt_tty.setup_std_outputs();
Logs.set_level(Some(Logs.Info));
Logs.set_reporter(Logs_fmt.reporter());

Http.Client.get(
  ~port=443,
  ~host=Sys.getenv("PROVIDER_HOST"),
  ~path="/.well-known/openid-configuration",
  (),
)
>>= (
  discover_response => {
    let discovery = Oidc.Discover.from_string(discover_response.body);

    Http.Server.start(
      ~context=Context.make_context(~discovery, ()),
      ~make_routes_callback=Router.make_callback,
      (),
    );
  }
)
|> Lwt_main.run;