module Util = struct
  let trim_leading_null s =
    Astring.String.trim ~drop:(function '\000' -> true | _ -> false) s

  let get_JWK_modulus n =
    Z.to_bits n |> CCString.rev |> trim_leading_null
    |> Base64.encode ~pad:true ~alphabet:Base64.uri_safe_alphabet

  let get_JWK_component e =
    Z.to_bits e |> CCString.rev |> trim_leading_null
    |> Base64.encode ~pad:false ~alphabet:Base64.uri_safe_alphabet

  let get_JWK_kid id =
    id |> Cstruct.to_string
    |> Base64.encode_exn ~pad:true ~alphabet:Base64.uri_safe_alphabet

  let get_JWK_x5t fingerprint =
    fingerprint |> Hex.of_cstruct |> Hex.to_bytes |> Bytes.to_string
    |> Base64.encode ~pad:false ~alphabet:Base64.uri_safe_alphabet ~len:20

  let get_modulus n =
    Base64.decode ~pad:true ~alphabet:Base64.uri_safe_alphabet n
    |> CCResult.map (fun x ->
           CCString.pad 128 ~c:'\000' x |> CCString.rev |> Z.of_bits)

  let get_component e =
    Base64.decode ~pad:false ~alphabet:Base64.uri_safe_alphabet e
    |> CCResult.map (fun x ->
           CCString.pad 8 ~c:'\000' x |> CCString.rev |> Z.of_bits)
end

module Pub = struct
  type t = {
    alg : string option;
    kty : string;
    (* `RSA ? *)
    use : string option;
    n : string;
    e : string;
    kid : string;
    x5t : string option;
  }

  let empty =
    { alg = None; kty = ""; use = None; n = ""; e = ""; kid = ""; x5t = None }

  let to_pub (t : t) : (Nocrypto.Rsa.pub, [ `Msg of string ]) result =
    let n = Util.get_modulus t.n in
    let e = Util.get_component t.e in
    match (e, n) with
    | Ok e, Ok n -> Ok { e; n }
    | _ -> Error (`Msg "Could not decode JWK")

  let of_pub (rsa_pub : Nocrypto.Rsa.pub) : (t, [ `Msg of string ]) result =
    let public_key : X509.Public_key.t = `RSA rsa_pub in
    let n = Util.get_JWK_modulus rsa_pub.n in
    let e = Util.get_JWK_component rsa_pub.e in
    let kid = Util.get_JWK_kid (X509.Public_key.id public_key) in
    let x5t = Util.get_JWK_x5t (X509.Public_key.fingerprint public_key) in
    match (n, e, x5t) with
    | Ok n, Ok e, Ok x5t ->
        Ok
          {
            alg = Some "RS256";
            kty = "RSA";
            use = Some "sig";
            n;
            e;
            kid;
            x5t = Some x5t;
          }
    | Ok n, Ok e, _ ->
        Ok
          {
            alg = Some "RS256";
            kty = "RSA";
            use = Some "sig";
            n;
            e;
            kid;
            x5t = None;
          }
    | Error (`Msg m), _, _ -> Error (`Msg ("n " ^ m))
    | _, Error (`Msg m), _ -> Error (`Msg ("e " ^ m))

  let of_pub_pem pem =
    Cstruct.of_string pem |> X509.Public_key.decode_pem
    |> CCResult.flat_map (function
         | `RSA pub_key -> Ok pub_key
         | _ -> Error (`Msg "Only RSA supported"))
    |> CCResult.flat_map of_pub

  let to_pub_pem t =
    to_pub t
    |> CCResult.map (fun p -> X509.Public_key.encode_pem (`RSA p))
    |> CCResult.map Cstruct.to_string

  let to_json_from_opt = CCOpt.map_or ~default:`Null Yojson.Basic.from_string

  let to_json t =
    `Assoc
      [
        ("alg", to_json_from_opt t.alg);
        ("kty", `String t.kty);
        ("use", to_json_from_opt t.use);
        ("n", `String t.n);
        ("e", `String t.e);
        ("kid", `String t.kid);
        ("x5t", to_json_from_opt t.x5t);
      ]

  let from_json json =
    Yojson.Basic.Util.
      {
        alg = json |> member "alg" |> to_string_option;
        kty = json |> member "kty" |> to_string;
        use = json |> member "use" |> to_string_option;
        n = json |> member "n" |> to_string;
        e = json |> member "e" |> to_string;
        kid = json |> member "kid" |> to_string;
        x5t = json |> member "x5t" |> to_string_option;
      }

  let from_string str = Yojson.Basic.from_string str |> from_json
end

module Priv = struct
  type t = {
    kty : string;
    n : string;
    e : string;
    d : string;
    p : string;
    q : string;
    dp : string;
    dq : string;
    qi : string;
    alg : string option;
    kid : string;
  }

  let of_priv (rsa_priv : Nocrypto.Rsa.priv) =
    let n = Util.get_JWK_modulus rsa_priv.n in
    let e = Util.get_JWK_component rsa_priv.e in
    let d = Util.get_JWK_component rsa_priv.d in
    let p = Util.get_JWK_component rsa_priv.p in
    let q = Util.get_JWK_component rsa_priv.q in
    let dp = Util.get_JWK_component rsa_priv.dp in
    let dq = Util.get_JWK_component rsa_priv.dq in
    let qi = Util.get_JWK_component rsa_priv.q' in

    match (n, e, d, p, q, dp, dq, qi) with
    | Ok n, Ok e, Ok d, Ok p, Ok q, Ok dp, Ok dq, Ok qi ->
        Ok
          {
            alg = Some "RS256";
            kty = "RSA";
            n;
            e;
            d;
            p;
            q;
            dp;
            dq;
            qi;
            kid = "unknown";
          }
    | _ -> Error (`Msg "Something failed")

  let to_priv (t : t) : (Nocrypto.Rsa.priv, [ `Msg of string ]) result =
    let n = Util.get_modulus t.n in
    let e = Util.get_component t.e in
    let d = Util.get_component t.d in
    let p = Util.get_component t.p in
    let q = Util.get_component t.q in
    let dp = Util.get_component t.dp in
    let dq = Util.get_component t.dq in
    let qi = Util.get_component t.qi in
    match (n, e, d, p, q, dp, dq, qi) with
    | Ok n, Ok e, Ok d, Ok p, Ok q, Ok dp, Ok dq, Ok qi ->
        Ok { e; n; d; p; q; dp; dq; q' = qi }
    | _ -> Error (`Msg "Could not decode JWK")

  let of_priv_pem pem =
    Cstruct.of_string pem |> X509.Private_key.decode_pem
    |> CCResult.flat_map (function `RSA pub_key -> Ok pub_key)
    |> CCResult.flat_map of_priv

  let to_priv_pem t =
    to_priv t
    |> CCResult.map (fun p -> X509.Private_key.encode_pem (`RSA p))
    |> CCResult.map Cstruct.to_string
end
