Library.Util.foo();

Http.Server.start(
  ~context=(),
  ~make_routes_callback=Library.Router.make_callback,
  (),
);