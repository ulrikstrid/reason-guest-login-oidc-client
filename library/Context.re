type session = {
  auth_json: Yojson.Basic.t,
  target_url: string,
  sitekey: string,
  nonce: string,
};

let session_hash: Hashtbl.t(string, session) = Hashtbl.create(64);

let set_session: (string, session) => unit =
  (key, value) => Hashtbl.add(session_hash, key, value);

let get_session: string => option(session) =
  key => Hashtbl.find_opt(session_hash, key);

let delete_session: string => unit = key => Hashtbl.remove(session_hash, key);

type t = {
  discovery: Oidc.Discover.t,
  client: Oidc.Client.t,
  set_session: (string, session) => unit,
  get_session: string => option(session),
  delete_session: string => unit,
};

let make_context = (~discovery, ()) => {
  client: {
    id: Sys.getenv("OIDC_CLIENT_ID"),
    redirect_uri: Sys.getenv("OIDC_REDIRECT_URI"),
  },
  discovery,
  set_session,
  get_session,
  delete_session,
};