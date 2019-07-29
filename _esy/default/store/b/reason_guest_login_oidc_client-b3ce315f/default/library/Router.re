let make_callback = (~httpImpl, ~context: 'a, reqd) => {
  open Http.HttpImpl;

  let req_uri = httpImpl.target |> Uri.of_string;
  let req_path = Uri.path(req_uri);
  print_endline(req_path);
  let path_parts = CCString.split_on_char('/', req_path);

  switch (httpImpl.meth, path_parts) {
  | (`GET, ["", "echo"]) =>
    Http.Response.Ok.make(~httpImpl, reqd) |> Lwt.return
  | (_, _) => Routes.FourOhFour.make(~httpImpl, reqd)
  };
};