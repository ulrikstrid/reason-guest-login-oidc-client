open TestFramework;

let rsa_test_priv = {|-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCrYL5Zq4rvXwEn
acjPDXjrl0UnAKfAchtNQIyEdf/a41tFgZkw1DXS2s+9eWNBarWYEwGhFoiOeeop
ShU7qa5IKL7pwLaO8vPbTPNWZZ9sy3Vx18lB54IyRPBX5lrLU+n0XuYyFcZa1+Gd
Dtgu+AQQqjDGGuSJecuABWH+rzzfumMi9K4gP9S0J8vq60mRna6R47Ati7t/jBJm
b2vSoSaWjtKf0LJoRPnbc7SgYF8D4JWJ3xQnsa8LrrBudV5j+N3uRDMimUeHL6iW
1KoAb8g1Iql/b3/2C0Z0M/O/13sECytFxDBVP9W+lvHwNF7pZR+C/BvhFH6FnrFI
fRismw8BAgMBAAECggEBAIsHKqS4Azf5TIhayusdtND6oMDpSS1X5EohaV00FOHP
u4WBg3MXVKq/k/PT++9fz/2UvaefDhz3Tj08ukjyeE5Vr7sV+YOyGJ35qRaXzmOG
ErrOIZjzZK2/O3MzjsiQRKVYL0rGW2nq5D5zgnFoBnQ2fObZfjkAs1QiCcOBCdM8
nttTO31JCwyBuTKGK3KaJdoba6dVze5Xhm1b/haCmq2EJOML5G73jK7m8aYkVDFb
FJOShYATyz5Xju33QEPz+HWcMrk/TKZFRQYSjWFAzy0/ENrMptIVff3UN0KL0YSl
0hNHlJwHStDEZAiMw4A20ojtKqfUkyR1kPzxpWdi/BkCgYEA4VVFhv5RNSJUGm1I
zhJT54UlfIW57c/NWx/Tqbhe0QYg//sM4c/s8lw45lvmRc7vKs6C/ZGo18p+XNT+
BaZdNFlxbtKJisM61Cegc8pIwzv4mbTyo9SjoWswxt20zVp8sIGeF4w7X94gPVZ0
f8D3OELujXqk2i34blLDbTGF3TsCgYEAwrOkxvZ1cdj4ouFqmTFuCvEKVGxsSQeT
Pc4/e/GsjzXGnIkLnsYbUnTXKzt7gLuu0I8B3gF0DqqPCJoGHQv6RIYdY8g6KLF+
4eGfYSJj6zjKOx4yKP7NT3vQLZehhIKbA723rWQVZ9N3e05P65OBkIp8f5MOfNgJ
O+OKVe49MPMCgYBA6S6JL7O3CbeOkVK6wj7XX9ynnWItJoJysJ1ps8nkjs5szyYr
2pjYTEa73VddXro465qCbzZjS1rRZS3z9LO+w9FQamfiyFCnEu8+y9PgIeOAa8bF
+RhWBKndb7qIuXtX4U7oW6Yy/Kru4HvY3X6Z/3X23ZClpT5+kWrohq6YRwKBgE/Q
uPHfQtIC8hpDciGOw9+0ZFmrgNCHTHL/w8KZlfW3Q84T2DGkYLryrupIHh7t0YIp
vcg2rE7+2FfcXDk4GcZRfGbVRBI+gRc0GNQG9xMMWsrVXBa2LZAx32txR4M8zzM/
aLap2qSPaeGgft7Bv1FzlAnwTPYc0dw9MQ589ZTFAoGBAJrB3sNh1ysIUdA3X1Jf
vUZfBCofmP+7Cqzln8gdeYA9iXUOoE4VTPw0jK71ZzsmlUejBz9S2ZUfs9q1Srge
yFo8Glr/8AXXUAt7iSJS4j7sz07EZbj14LfoooSem+w/ZONy8Sdtm/WMox/iBg7S
s+Ix44bf/PXcAri2w7OQp/G6
-----END PRIVATE KEY-----|};

let rsa_test_pub = {|-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAq2C+WauK718BJ2nIzw14
65dFJwCnwHIbTUCMhHX/2uNbRYGZMNQ10trPvXljQWq1mBMBoRaIjnnqKUoVO6mu
SCi+6cC2jvLz20zzVmWfbMt1cdfJQeeCMkTwV+Zay1Pp9F7mMhXGWtfhnQ7YLvgE
EKowxhrkiXnLgAVh/q8837pjIvSuID/UtCfL6utJkZ2ukeOwLYu7f4wSZm9r0qEm
lo7Sn9CyaET523O0oGBfA+CVid8UJ7GvC66wbnVeY/jd7kQzIplHhy+oltSqAG/I
NSKpf29/9gtGdDPzv9d7BAsrRcQwVT/Vvpbx8DRe6WUfgvwb4RR+hZ6xSH0YrJsP
AQIDAQAB
-----END PUBLIC KEY-----|};

let rsa_test_pub_2 = {|-----BEGIN PUBLIC KEY-----
MIGeMA0GCSqGSIb3DQEBAQUAA4GMADCBiAKBgHvcKHCv551lUYeZsJk9aDRv1fGl
P5lfTBXEKL1fwP1lnBLT/omQ9jx/bqoTYQKMqfSeOwWry7f324prXo2FG9C/VRpJ
cEX/JMQuVgf4OoOjIueHZFnzEymEzMU2JlVVSl0ioTxwvhVmElzbpYh27ABJK/PN
Su2L9lVb8BvQngCPAgMBAAE=
-----END PUBLIC KEY-----|};

describe("JWK", ({test}) => {
  test("Creates a correct jwt from pem", ({expect}) => {
    Jose.Jwk.Pub.of_pub_pem(rsa_test_pub)
    |> (
      r => {
        open Jose.Jwk.Pub;
        expect.result(r).toBeOk();

        CCResult.get_exn(r)
        |> (
          jwk => {
            expect.string(jwk.kty).toMatch("RSA");
            expect.string(jwk.e).toMatch("AQAB");
            expect.string(jwk.n).toMatch(
              "q2C-WauK718BJ2nIzw1465dFJwCnwHIbTUCMhHX_2uNbRYGZMNQ10trPvXljQWq1mBMBoRaIjnnqKUoVO6muSCi-6cC2jvLz20zzVmWfbMt1cdfJQeeCMkTwV-Zay1Pp9F7mMhXGWtfhnQ7YLvgEEKowxhrkiXnLgAVh_q8837pjIvSuID_UtCfL6utJkZ2ukeOwLYu7f4wSZm9r0qEmlo7Sn9CyaET523O0oGBfA-CVid8UJ7GvC66wbnVeY_jd7kQzIplHhy-oltSqAG_INSKpf29_9gtGdDPzv9d7BAsrRcQwVT_Vvpbx8DRe6WUfgvwb4RR-hZ6xSH0YrJsPAQ",
            );
          }
        );
      }
    )
  });

  test("Roundtrip", ({expect}) => {
    Jose.Jwk.Pub.of_pub_pem(rsa_test_pub_2)
    |> CCResult.get_exn
    |> Jose.Jwk.Pub.to_pub_pem
    |> (
      pub_cert => {
        expect.string(pub_cert).toMatch(rsa_test_pub_2);
      }
    )
  });
});
