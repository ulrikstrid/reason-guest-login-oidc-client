let handler = (~context, request: Morph.Request.t) => {
  let req_uri = request.target |> Uri.of_string;
  let req_path = Uri.path(req_uri);
  let path_parts =
    CCString.split(~by="/", req_path) |> CCList.filter(s => s != "");

  switch (request.meth, path_parts) {
  | (_, ["success.txt"]) =>
    Morph.Response.empty |> Morph.Response.text("success")
  | (_, ["guest", "s", sitekey]) =>
    CheckMacAndUrl.middleware(GuestLanding.make(~context, sitekey), request)
  | (`GET, ["auth", "cb"]) => AuthCallback.make(~context, req_uri)
  | (_, _) => Morph.Response.not_found(Morph.Response.empty)
  };
};
