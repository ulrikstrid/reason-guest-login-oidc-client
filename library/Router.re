let handler = (request: Morph.Request.t) => {
  let req_uri = request.target |> Uri.of_string;
  let req_path = Uri.path(req_uri);
  let path_parts =
    CCString.split(~by="/", req_path) |> CCList.filter(s => s != "");

  switch (request.meth, path_parts) {
  | (_, ["success.txt"]) =>
    Morph.Response.empty |> Morph.Response.text("success")
  | (_, ["guest", "s", sitekey]) =>
    CheckMacAndUrl.middleware(GuestLanding.make(sitekey), request)
  | (`GET, ["guest", "redirect", state]) => LoginToWifi.make(state, request)
  | (`GET, ["auth", "cb"]) => AuthCallback.make(req_uri, request)
  | (_, _) => Morph.Response.not_found(Morph.Response.empty)
  };
};
