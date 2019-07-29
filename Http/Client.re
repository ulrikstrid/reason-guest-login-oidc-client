open Lwt.Infix;

type response = {
  body: string,
  headers: list((string, string)),
};

let error_handler = _ => assert(false);

let read_response = (~notify_finished, response, response_body) =>
  switch (response) {
  | {Httpaf.Response.status: `OK, headers, _} =>
    let content_length =
      Httpaf.Headers.get(headers, "content-length")
      |> CCOpt.flat_map(CCInt.of_string)
      |> CCOpt.get_or(~default=2048);
    let body_buffer = Buffer.create(content_length);

    let rec on_read = (bs, ~off, ~len) => {
      let request_data_bytes = Bytes.create(len);
      Bigstringaf.blit_to_bytes(
        bs,
        ~src_off=0,
        request_data_bytes,
        ~dst_off=off,
        ~len,
      );
      Buffer.add_bytes(body_buffer, request_data_bytes);
      Httpaf.Body.schedule_read(response_body, ~on_read, ~on_eof);
    }
    and on_eof = () => {
      Lwt.wakeup_later(
        notify_finished,
        {
          body: Buffer.contents(body_buffer),
          headers: Httpaf.Headers.to_list(headers),
        },
      );
    };

    Httpaf.Body.schedule_read(response_body, ~on_read, ~on_eof);
  | response =>
    Format.fprintf(
      Format.err_formatter,
      "%a\n%!",
      Httpaf.Response.pp_hum,
      response,
    );
    exit(1);
  };

let get = (port, host, path) => {
  Lwt_unix.getaddrinfo(
    host,
    CCInt.to_string(port),
    [Unix.(AI_FAMILY(PF_INET))],
  )
  >>= (
    addresses => {
      let socket = Lwt_unix.socket(Unix.PF_INET, Unix.SOCK_STREAM, 0);
      Lwt_unix.connect(socket, CCList.hd(addresses).Unix.ai_addr)
      >>= (
        () => {
          let (finished, notify_finished) = Lwt.wait();
          let response_handler = read_response(~notify_finished);
          let headers = Httpaf.Headers.of_list([("host", host)]);
          Httpaf_lwt_unix.Client.SSL.create_connection(socket)
          >>= (
            connection => {
              let request_body =
                Httpaf_lwt_unix.Client.SSL.request(
                  connection,
                  ~error_handler,
                  ~response_handler,
                  Httpaf.Request.create(~headers, `GET, path),
                );
              Httpaf.Body.close_writer(request_body);
              finished;
            }
          );
        }
      );
    }
  );
};