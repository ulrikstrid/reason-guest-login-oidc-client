FROM node:lts-alpine as builder

ENV TERM=dumb \
    LD_LIBRARY_PATH=/usr/local/lib:/usr/lib:/lib

WORKDIR /guest-portal

RUN apk add --no-cache \
    libev libev-dev jq \
    ca-certificates wget \
    bash curl perl-utils \
    git patch gcc g++ \
    make m4 util-linux zlib-dev \
    linux-headers musl-dev

RUN wget -q -O /etc/apk/keys/sgerrand.rsa.pub https://alpine-pkgs.sgerrand.com/sgerrand.rsa.pub
RUN wget https://github.com/sgerrand/alpine-pkg-glibc/releases/download/2.28-r0/glibc-2.28-r0.apk
RUN apk add --no-cache glibc-2.28-r0.apk

RUN npm install -g esy@0.5.8 --unsafe-perm


COPY docker-cache.json /guest-portal/package.json
COPY esy.lock /guest-portal/esy.lock

RUN esy

COPY . /guest-portal

RUN esy install
RUN esy build

RUN esy dune build --profile=docker

RUN esy mv "#{self.target_dir / 'default' / 'executable' / 'ReasonGuestLoginOidcClientApp.exe'}" main.exe

RUN strip main.exe

FROM scratch

WORKDIR /guest-portal

COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /guest-portal/main.exe main.exe

EXPOSE 8080 9443

ENTRYPOINT ["/guest-portal/main.exe"]
