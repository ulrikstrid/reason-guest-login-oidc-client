let make_callback = (~httpImpl, ~context: Oidc.Discover.t, reqd) => {
  open Http.HttpImpl;

  let req_uri = httpImpl.target |> Uri.of_string;
  let req_path = Uri.path(req_uri);
  let path_parts = CCString.split(~by="/", req_path) |> CCList.drop(1);

  switch (httpImpl.meth, path_parts) {
  | (_, ["success.txt"]) =>
    Http.Response.Text.make(~httpImpl, ~text="success", reqd) |> Lwt.return
  | (_, [text]) =>
    Http.Response.Html.make(
      ~httpImpl,
      ~markup="<html><body><h1>" ++ text ++ "</h1></body></html>",
      reqd,
    )
    |> Lwt.return
  | (_, ["guest", "s", sitekey]) =>
    Http.Response.Html.make(
      ~httpImpl,
      ~markup="<html><body><h1>Sitekey: " ++ sitekey ++ "</h1></body></html>",
      reqd,
    )
    |> Lwt.return
  | (_, _) => Routes.FourOhFour.make(~httpImpl, reqd)
  };
};