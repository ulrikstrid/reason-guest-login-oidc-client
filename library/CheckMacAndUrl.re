module Env = {
  let key = Hmap.Key.create();
};

let middleware: Morph.Server.middleware =
  (handler, request) => {
    let req_uri = request.target |> Uri.of_string;
    switch (
      Uri.get_query_param(req_uri, "id"),
      Uri.get_query_param(req_uri, "url"),
    ) {
    | (Some(device_mac), Some(target_url)) =>
      let next_request = {
        ...request,
        context:
          Hmap.add(Env.key, (device_mac, target_url), request.context),
      };
      handler(next_request);
    | _ => Morph.Response.text("id or url not provided", Morph.Response.empty)
    };
  };
