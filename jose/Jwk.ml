module Util = struct
  let trim_leading_null s =
    Astring.String.trim ~drop:(function '\000' -> true | _ -> false) s

  let get_JWK_modulus n =
    Z.to_bits n |> CCString.rev |> trim_leading_null
    |> Base64.encode ~pad:true ~alphabet:Base64.uri_safe_alphabet

  let get_JWK_exponent e =
    Z.to_bits e |> CCString.rev |> trim_leading_null
    |> Base64.encode ~pad:false ~alphabet:Base64.uri_safe_alphabet

  let get_JWK_kid public_key =
    X509.Public_key.id public_key
    |> Cstruct.to_string
    |> Base64.encode ~pad:false ~alphabet:Base64.uri_safe_alphabet

  let get_JWK_x5t public_key =
    X509.Public_key.fingerprint public_key
    |> Hex.of_cstruct |> Hex.to_bytes |> Bytes.to_string
    |> Base64.encode ~pad:false ~alphabet:Base64.uri_safe_alphabet ~len:20

  let get_modulus n =
    Base64.decode_exn ~pad:true ~alphabet:Base64.uri_safe_alphabet n
    |> CCString.pad 128 ~c:'\000' |> CCString.rev |> Z.of_bits

  let get_exponent e =
    Base64.decode_exn ~pad:false ~alphabet:Base64.uri_safe_alphabet e
    |> CCString.pad 8 ~c:'\000' |> CCString.rev |> Z.of_bits
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

  let to_pub (t : t) : Nocrypto.Rsa.pub =
    let n = Util.get_modulus t.n in
    let e = Util.get_exponent t.e in
    { e; n }

  let of_pub (rsa_pub : Nocrypto.Rsa.pub) : (t, [ `Msg of string ]) result =
    let public_key : X509.Public_key.t = `RSA rsa_pub in
    let n = Util.get_JWK_modulus rsa_pub.n in
    let e = Util.get_JWK_exponent rsa_pub.e in
    let kid = Util.get_JWK_kid public_key in
    let x5t = Util.get_JWK_x5t public_key in
    match (n, e, kid, x5t) with
    | Ok n, Ok e, Ok kid, Ok x5t ->
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
    | Ok n, Ok e, Ok kid, _ ->
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
    | Error (`Msg m), _, _, _ -> Error (`Msg ("n " ^ m))
    | _, Error (`Msg m), _, _ -> Error (`Msg ("e " ^ m))
    | _, _, Error (`Msg m), _ -> Error (`Msg ("kid " ^ m))

  let of_pub_pem pem =
    Cstruct.of_string pem |> X509.Public_key.decode_pem
    |> CCResult.flat_map (function
         | `RSA pub_key -> Ok pub_key
         | _ -> Error (`Msg "Only RSA supported"))
    |> CCResult.flat_map of_pub

  let to_pub_pem t =
    to_pub t
    |> (fun p -> X509.Public_key.encode_pem (`RSA p))
    |> Cstruct.to_string

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
  type public_key = {
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
end
