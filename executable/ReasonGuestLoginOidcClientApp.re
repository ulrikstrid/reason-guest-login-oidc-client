open Lwt.Infix;
open Library;

Fmt_tty.setup_std_outputs();
Logs.set_level(Some(Logs.Info));
Logs.set_reporter(Logs_fmt.reporter());

let http_server = Morph_server_http.make();
let discovery_url =
  Printf.sprintf(
    "https://%s/.well-known/openid-configuration",
    Sys.getenv("PROVIDER_HOST"),
  );

let discovery_request = Morph.Request.make(~meth=`GET, discovery_url);

Morph_client.handle(discovery_request)
>>= (
  response => {
    let body =
      switch (response.body) {
      | `String(body) => body
      | _ => ""
      };

    let discovery = Oidc.Discover.from_string(body);
    let context = Context.make(~discovery, ());

    Morph.start(
      ~servers=[http_server],
      ~middlewares=[Context.middleware(~context)],
      Router.handler,
    );
  }
)
|> Lwt_main.run;
