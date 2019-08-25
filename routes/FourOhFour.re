open Http.Request;

let make = (~request, ~message=request.target ++ " not found", ()) =>
  Http.Response.NotFound.make(~message, ());
