let session_hash: Hashtbl.t(string, Yojson.Basic.t) = Hashtbl.create(64);

let set_session: (string, Yojson.Basic.t) => unit =
  (key, value) => Hashtbl.add(session_hash, key, value);

let get_session: string => option(Yojson.Basic.t) =
  key => Hashtbl.find_opt(session_hash, key);

type t = {
  discovery: Oidc.Discover.t,
  set_session: (string, Yojson.Basic.t) => unit,
  get_session: string => option(Yojson.Basic.t),
};