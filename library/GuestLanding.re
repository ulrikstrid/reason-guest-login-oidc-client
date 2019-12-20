let make = (sitekey, request: Morph.Request.t) => {
  open Context;

  let context = Context.get_context(request);

  let req_uri = Uri.of_string(request.target);
  let (device_mac, target_url) =
    Hmap.get(CheckMacAndUrl.Env.key, request.context);

  let cookie_key =
    Uuidm.v4_gen(Random.State.make_self_init(), ()) |> Uuidm.to_string;

  let nonce =
    Uuidm.v4_gen(Random.State.make_self_init(), ()) |> Uuidm.to_string;

  let ap_mac =
    Uri.get_query_param(req_uri, "ap")
    |> (
      fun
      | Some(ap_mac) => `String(ap_mac)
      | None => `Null
    );

  let auth_json =
    `Assoc([
      ("cmd", `String("authorize-guest")),
      ("mac", `String(device_mac)),
      ("minutes", `Int(120)),
      ("ap_mac", ap_mac),
    ]);

  context.set_session(cookie_key, {auth_json, target_url, sitekey, nonce});

  let paremeters =
    Oidc.Parameters.{
      response_type: ["code"],
      client: context.client,
      redirect_uri: Sys.getenv("OIDC_REDIRECT_URI"),
      scope: ["openid"],
      state: Some(cookie_key),
      nonce,
      claims: None,
      max_age: None,
      display: None,
      prompt: None,
    };

  let query = Oidc.Parameters.to_query(paremeters);

  Morph.Response.redirect(
    context.discovery.authorization_endpoint ++ query,
    Morph.Response.empty,
  );
};
