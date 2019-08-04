let make_callback = (~httpImpl, ~context: Context.t, reqd) => {
  open Http.HttpImpl;

  let req_uri = httpImpl.target |> Uri.of_string;
  let req_path = Uri.path(req_uri);
  let path_parts =
    CCString.split(~by="/", req_path) |> CCList.filter(s => s != "");

  switch (httpImpl.meth, path_parts) {
  | (_, ["success.txt"]) =>
    Http.Response.Text.make(~httpImpl, ~text="success", reqd) |> Lwt.return
  | (_, ["guest", "s", sitekey]) =>
    GuestLanding.make(~httpImpl, ~context, ~req_uri, ~sitekey, reqd)
  | (`GET, ["auth", "cb"]) =>
    AuthCallback.make(~httpImpl, ~context, ~req_uri, reqd)
  | (_, _) => Routes.FourOhFour.make(~httpImpl, reqd)
  };
};