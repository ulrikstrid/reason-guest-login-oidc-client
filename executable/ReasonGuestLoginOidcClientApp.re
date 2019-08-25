open Lwt.Infix;
open Library;

Fmt_tty.setup_std_outputs();
Logs.set_level(Some(Logs.Info));
Logs.set_reporter(Logs_fmt.reporter());

Http.Client.fetch(
  Printf.sprintf(
    "https://%s/.well-known/openid-configuration",
    Sys.getenv("PROVIDER_HOST"),
  ),
)
>>= (
  fun
  | Ok(discover_response) => {
      let discovery = Oidc.Discover.from_string(discover_response.body);

      Http.Server.start(
        ~context=Context.make_context(~discovery, ()),
        Router.make_callback,
      );
    }
  | Error(`Msg(message)) =>
    Logs.err(m => m("Discovery failed with: %s", message)) |> Lwt.return
)
|> Lwt_main.run;
