let make_callback = (~request, context: Context.t) => {
  open Http.Request;

  let req_uri = request.target |> Uri.of_string;
  let req_path = Uri.path(req_uri);
  let path_parts =
    CCString.split(~by="/", req_path) |> CCList.filter(s => s != "");

  switch (request.meth, path_parts) {
  | (_, ["success.txt"]) => Http.Response.Text.make("success")
  | (_, ["guest", "s", sitekey]) =>
    GuestLanding.make(~context, req_uri, sitekey)
  | (`GET, ["auth", "cb"]) => AuthCallback.make(~context, req_uri)
  | (_, _) => Routes.FourOhFour.make(~request, ())
  };
};
