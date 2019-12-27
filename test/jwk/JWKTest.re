open TestFramework;

let rsa_test_priv = {|-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDo+jbfEmKkTIF9
XCsGrrysgPw0hKC/dGQtG3DPpiZ10i/O3gpHuRBtF6RO+BntgOcIMq2v6XBuK9fr
+1H/2SWnwEoK2Tuta6i42Fo4Dma1/CnzTO192qobLbnQoyrI7V8PuYox9B9HtYx7
5bXKA04bZiVLOEY4MakTYVLPp1weU5NrkAkcS+ivXvbcSS8PwWOqiUlM62W9tSD0
P0dZgdO0w62KIpJP2tEVpwHsD6mnPOfyF6IH+pzlRDiBvDWLumpwrPCrNoRofAGu
/cINnbzDBk3HK2v3u7eEZpEfY1LAHo6F/uaiPT59DS5j1RlxoUqve8aoUf82ijmR
WbnMW10lAgMBAAECggEAELnN8KvgOw1nCnnweNVYpEXKVXbkF3qiqn5a1f2Gq1TA
q+hS8p09qadV23mCWwOzEmqY/5URxkcNhFqRo32Sb32lkyvPVf7xqPuXVojqJMyK
snXmYu+s4LCis3DTZINuHLHkUvvEtyA4iriOGYetNthZexH6MJSYH9UP3eqU+XRB
f3lw3oU+ZWJcnJiEvJa2H4haf70C0mFdTyKQQkops4QkgBEVIVtaVHXPgFnH1eh9
uUSWlTiWqauWqe1h5jaEZbFAWPyanYAizLbGeQyOYf1N+0E4OsoRIiTQp1rRGfxU
YO2mQelv2j15IXyQ8fZOCjvGEwiTQ6qn8g+UN4aFzQKBgQD7aodkMYS8p+a5N52d
VhC03tZMcRqYKEutsTwDG5FdjoXou/DMJHfR7owb71gBpSZtfmA15BuFgHEvXc+O
8ska2KDcBUIfOO3PvsD3ap41zwCMZ2DMyngSlycgknHdzsR4CiB7/D/zmkLBWYNO
vZVRKxBYgEHcfxkiWVrPKj0QGwKBgQDtOZ+rEUtWwu0PSb5giF7Bt5iK6y+cDI9k
G8o5JncugjP5WrRLH8VjKzuL7fT3aNnUu02oOCg5mpFmGWu1QXuWpGrcbfgd5xg3
qN/ZSFljqmwoLdT83uW8h4Dn+MI0NJRXYZZQHr4GujzGp/Zb8yYlV7RgrFpxmSO9
kO2LaOSbvwKBgQCDaSARZ6yYqy32m7I/fa/Hyj26wNeEtnMv+1aBzVQC0a7+gdWP
7nPOf+At7cFTQs4+JvME2BDmi8cdWexWLGKfLKGPvxPbm/b5Qhw8djbxqxv/Rz2a
bS2rkeP6q3Dm3d9lWu21wJhwrK29wBrY+lDklxy5FXjXVnt9r7S+WbaHBwKBgBCV
5MnrDZ9lRXm6KCtLnYRht7KOuudoIWZYYw0X2WFRDR0z8EMIV56VWTZxTp01oXU0
GzvVoUpVujCvOk6T43YmzKnYrm44yAKsNepVGprTQXiVq7x6QQmrV6HgTIOl4XEy
i3XSkGqb/r/M4naPS2108lGH+1LR6CPKzDDhBoq1AoGBAIXvuhHZuTpW+S7XosUo
3OLEi3Xo3ZS4NHViKhFMQTQgKtoO3K4yWgBTh3qu2p8EhavZpZQWDu2LGISjPpW1
vKYFpE2KyahSJmfZ21UzsrwoaMuuy31kggReTt1yEJm/CnTDGihgCLqKAi389GG6
EQBaMSFXOODiel+5MdQcj41b
-----END PRIVATE KEY-----
|};

/*
 PRIVATE JWK
 {
   e: "AQAB",
   n:
     "6Po23xJipEyBfVwrBq68rID8NISgv3RkLRtwz6YmddIvzt4KR7kQbRekTvgZ7YDnCDKtr-lwbivX6_tR_9klp8BKCtk7rWuouNhaOA5mtfwp80ztfdqqGy250KMqyO1fD7mKMfQfR7WMe-W1ygNOG2YlSzhGODGpE2FSz6dcHlOTa5AJHEvor1723EkvD8FjqolJTOtlvbUg9D9HWYHTtMOtiiKST9rRFacB7A-ppzzn8heiB_qc5UQ4gbw1i7pqcKzwqzaEaHwBrv3CDZ28wwZNxytr97u3hGaRH2NSwB6Ohf7moj0-fQ0uY9UZcaFKr3vGqFH_Noo5kVm5zFtdJQ",
   d:
     "ELnN8KvgOw1nCnnweNVYpEXKVXbkF3qiqn5a1f2Gq1TAq-hS8p09qadV23mCWwOzEmqY_5URxkcNhFqRo32Sb32lkyvPVf7xqPuXVojqJMyKsnXmYu-s4LCis3DTZINuHLHkUvvEtyA4iriOGYetNthZexH6MJSYH9UP3eqU-XRBf3lw3oU-ZWJcnJiEvJa2H4haf70C0mFdTyKQQkops4QkgBEVIVtaVHXPgFnH1eh9uUSWlTiWqauWqe1h5jaEZbFAWPyanYAizLbGeQyOYf1N-0E4OsoRIiTQp1rRGfxUYO2mQelv2j15IXyQ8fZOCjvGEwiTQ6qn8g-UN4aFzQ",
   p:
     "-2qHZDGEvKfmuTednVYQtN7WTHEamChLrbE8AxuRXY6F6LvwzCR30e6MG-9YAaUmbX5gNeQbhYBxL13PjvLJGtig3AVCHzjtz77A92qeNc8AjGdgzMp4EpcnIJJx3c7EeAoge_w_85pCwVmDTr2VUSsQWIBB3H8ZIllazyo9EBs",
   q:
     "7TmfqxFLVsLtD0m-YIhewbeYiusvnAyPZBvKOSZ3LoIz-Vq0Sx_FYys7i-3092jZ1LtNqDgoOZqRZhlrtUF7lqRq3G34HecYN6jf2UhZY6psKC3U_N7lvIeA5_jCNDSUV2GWUB6-Bro8xqf2W_MmJVe0YKxacZkjvZDti2jkm78",
   dp:
     "g2kgEWesmKst9puyP32vx8o9usDXhLZzL_tWgc1UAtGu_oHVj-5zzn_gLe3BU0LOPibzBNgQ5ovHHVnsVixinyyhj78T25v2-UIcPHY28asb_0c9mm0tq5Hj-qtw5t3fZVrttcCYcKytvcAa2PpQ5JccuRV411Z7fa-0vlm2hwc",
   dq:
     "EJXkyesNn2VFebooK0udhGG3so6652ghZlhjDRfZYVENHTPwQwhXnpVZNnFOnTWhdTQbO9WhSlW6MK86TpPjdibMqdiubjjIAqw16lUamtNBeJWrvHpBCatXoeBMg6XhcTKLddKQapv-v8zido9LbXTyUYf7UtHoI8rMMOEGirU",
   qi:
     "he-6Edm5Olb5LteixSjc4sSLdejdlLg0dWIqEUxBNCAq2g7crjJaAFOHeq7anwSFq9mllBYO7YsYhKM-lbW8pgWkTYrJqFImZ9nbVTOyvChoy67LfWSCBF5O3XIQmb8KdMMaKGAIuooCLfz0YboRAFoxIVc44OJ6X7kx1ByPjVs",
   kty: "RSA",
   kid: "0IRFN_RUHUQcXcdp_7PLBxoG_9b6bHrvGH0p8qRotik"
 }
 */

let rsa_test_pub = {|-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA6Po23xJipEyBfVwrBq68
rID8NISgv3RkLRtwz6YmddIvzt4KR7kQbRekTvgZ7YDnCDKtr+lwbivX6/tR/9kl
p8BKCtk7rWuouNhaOA5mtfwp80ztfdqqGy250KMqyO1fD7mKMfQfR7WMe+W1ygNO
G2YlSzhGODGpE2FSz6dcHlOTa5AJHEvor1723EkvD8FjqolJTOtlvbUg9D9HWYHT
tMOtiiKST9rRFacB7A+ppzzn8heiB/qc5UQ4gbw1i7pqcKzwqzaEaHwBrv3CDZ28
wwZNxytr97u3hGaRH2NSwB6Ohf7moj0+fQ0uY9UZcaFKr3vGqFH/Noo5kVm5zFtd
JQIDAQAB
-----END PUBLIC KEY-----
|};

/*
 PUB JWK
 {
   e: "AQAB",
   n:
     "6Po23xJipEyBfVwrBq68rID8NISgv3RkLRtwz6YmddIvzt4KR7kQbRekTvgZ7YDnCDKtr-lwbivX6_tR_9klp8BKCtk7rWuouNhaOA5mtfwp80ztfdqqGy250KMqyO1fD7mKMfQfR7WMe-W1ygNOG2YlSzhGODGpE2FSz6dcHlOTa5AJHEvor1723EkvD8FjqolJTOtlvbUg9D9HWYHTtMOtiiKST9rRFacB7A-ppzzn8heiB_qc5UQ4gbw1i7pqcKzwqzaEaHwBrv3CDZ28wwZNxytr97u3hGaRH2NSwB6Ohf7moj0-fQ0uY9UZcaFKr3vGqFH_Noo5kVm5zFtdJQ",
   kty: "RSA",
   kid: "0IRFN_RUHUQcXcdp_7PLBxoG_9b6bHrvGH0p8qRotik"
 }
 */

describe("JWK.Pub", ({test}) => {
  test("Creates a correct jwt from pem", ({expect}) => {
    Jose.Jwk.Pub.of_pub_pem(rsa_test_pub)
    |> (
      r => {
        open Jose.Jwk.Pub;
        expect.result(r).toBeOk();

        CCResult.get_exn(r)
        |> (
          jwk => {
            expect.string(jwk.kty).toEqual("RSA");
            expect.string(jwk.e).toEqual("AQAB");
            expect.string(jwk.n).toEqual(
              "6Po23xJipEyBfVwrBq68rID8NISgv3RkLRtwz6YmddIvzt4KR7kQbRekTvgZ7YDnCDKtr-lwbivX6_tR_9klp8BKCtk7rWuouNhaOA5mtfwp80ztfdqqGy250KMqyO1fD7mKMfQfR7WMe-W1ygNOG2YlSzhGODGpE2FSz6dcHlOTa5AJHEvor1723EkvD8FjqolJTOtlvbUg9D9HWYHTtMOtiiKST9rRFacB7A-ppzzn8heiB_qc5UQ4gbw1i7pqcKzwqzaEaHwBrv3CDZ28wwZNxytr97u3hGaRH2NSwB6Ohf7moj0-fQ0uY9UZcaFKr3vGqFH_Noo5kVm5zFtdJQ",
            );
            // TODO: Figure if we want to do the same as Panva with kid
            expect.string(jwk.kid).toEqual("Yivu3QTFD7-Dkkd6dlKdhOCpfWg=");
          }
        );
      }
    )
  });

  test("Roundtrip", ({expect}) => {
    Jose.Jwk.Pub.of_pub_pem(rsa_test_pub)
    |> CCResult.flat_map(Jose.Jwk.Pub.to_pub_pem)
    |> CCResult.get_exn
    |> (
      pub_cert => {
        expect.string(pub_cert).toEqual(rsa_test_pub);
      }
    )
  });
});

describe("JWK.Priv", ({test}) => {
  test("Creates a correct jwt from pem", ({expect}) => {
    Jose.Jwk.Priv.of_priv_pem(rsa_test_priv)
    |> (
      r => {
        open Jose.Jwk.Priv;
        expect.result(r).toBeOk();

        CCResult.get_exn(r)
        |> (
          jwk => {
            expect.string(jwk.kty).toEqual("RSA");
            expect.string(jwk.e).toEqual("AQAB");
            expect.string(jwk.n).toEqual(
              "6Po23xJipEyBfVwrBq68rID8NISgv3RkLRtwz6YmddIvzt4KR7kQbRekTvgZ7YDnCDKtr-lwbivX6_tR_9klp8BKCtk7rWuouNhaOA5mtfwp80ztfdqqGy250KMqyO1fD7mKMfQfR7WMe-W1ygNOG2YlSzhGODGpE2FSz6dcHlOTa5AJHEvor1723EkvD8FjqolJTOtlvbUg9D9HWYHTtMOtiiKST9rRFacB7A-ppzzn8heiB_qc5UQ4gbw1i7pqcKzwqzaEaHwBrv3CDZ28wwZNxytr97u3hGaRH2NSwB6Ohf7moj0-fQ0uY9UZcaFKr3vGqFH_Noo5kVm5zFtdJQ",
            );
            expect.string(jwk.d).toEqual(
              "ELnN8KvgOw1nCnnweNVYpEXKVXbkF3qiqn5a1f2Gq1TAq-hS8p09qadV23mCWwOzEmqY_5URxkcNhFqRo32Sb32lkyvPVf7xqPuXVojqJMyKsnXmYu-s4LCis3DTZINuHLHkUvvEtyA4iriOGYetNthZexH6MJSYH9UP3eqU-XRBf3lw3oU-ZWJcnJiEvJa2H4haf70C0mFdTyKQQkops4QkgBEVIVtaVHXPgFnH1eh9uUSWlTiWqauWqe1h5jaEZbFAWPyanYAizLbGeQyOYf1N-0E4OsoRIiTQp1rRGfxUYO2mQelv2j15IXyQ8fZOCjvGEwiTQ6qn8g-UN4aFzQ",
            );

            expect.string(jwk.p).toEqual(
              "-2qHZDGEvKfmuTednVYQtN7WTHEamChLrbE8AxuRXY6F6LvwzCR30e6MG-9YAaUmbX5gNeQbhYBxL13PjvLJGtig3AVCHzjtz77A92qeNc8AjGdgzMp4EpcnIJJx3c7EeAoge_w_85pCwVmDTr2VUSsQWIBB3H8ZIllazyo9EBs",
            );

            expect.string(jwk.q).toEqual(
              "7TmfqxFLVsLtD0m-YIhewbeYiusvnAyPZBvKOSZ3LoIz-Vq0Sx_FYys7i-3092jZ1LtNqDgoOZqRZhlrtUF7lqRq3G34HecYN6jf2UhZY6psKC3U_N7lvIeA5_jCNDSUV2GWUB6-Bro8xqf2W_MmJVe0YKxacZkjvZDti2jkm78",
            );

            expect.string(jwk.dp).toEqual(
              "g2kgEWesmKst9puyP32vx8o9usDXhLZzL_tWgc1UAtGu_oHVj-5zzn_gLe3BU0LOPibzBNgQ5ovHHVnsVixinyyhj78T25v2-UIcPHY28asb_0c9mm0tq5Hj-qtw5t3fZVrttcCYcKytvcAa2PpQ5JccuRV411Z7fa-0vlm2hwc",
            );

            expect.string(jwk.dq).toEqual(
              "EJXkyesNn2VFebooK0udhGG3so6652ghZlhjDRfZYVENHTPwQwhXnpVZNnFOnTWhdTQbO9WhSlW6MK86TpPjdibMqdiubjjIAqw16lUamtNBeJWrvHpBCatXoeBMg6XhcTKLddKQapv-v8zido9LbXTyUYf7UtHoI8rMMOEGirU",
            );

            expect.string(jwk.qi).toEqual(
              "he-6Edm5Olb5LteixSjc4sSLdejdlLg0dWIqEUxBNCAq2g7crjJaAFOHeq7anwSFq9mllBYO7YsYhKM-lbW8pgWkTYrJqFImZ9nbVTOyvChoy67LfWSCBF5O3XIQmb8KdMMaKGAIuooCLfz0YboRAFoxIVc44OJ6X7kx1ByPjVs",
            );
          }
        );
      }
    )
  });

  test("Roundtrip", ({expect}) => {
    Jose.Jwk.Priv.of_priv_pem(rsa_test_priv)
    |> CCResult.flat_map(Jose.Jwk.Priv.to_priv_pem)
    |> CCResult.get_exn
    |> (
      pub_cert => {
        expect.string(pub_cert).toEqual(rsa_test_priv);
      }
    )
  });
});
