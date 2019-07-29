#!/usr/bin/env node
/* eslint-disable max-len, flowtype/require-valid-file-annotation, flowtype/require-return-type */
/* global packageInformationStores, $$BLACKLIST, $$SETUP_STATIC_TABLES */

// Used for the resolveUnqualified part of the resolution (ie resolving folder/index.js & file extensions)
// Deconstructed so that they aren't affected by any fs monkeypatching occuring later during the execution
const {statSync, lstatSync, readlinkSync, readFileSync, existsSync, realpathSync} = require('fs');

const Module = require('module');
const path = require('path');
const StringDecoder = require('string_decoder');

const $$BLACKLIST = null;
const ignorePattern = $$BLACKLIST ? new RegExp($$BLACKLIST) : null;

const builtinModules = new Set(Module.builtinModules || Object.keys(process.binding('natives')));

const topLevelLocator = {name: null, reference: null};
const blacklistedLocator = {name: NaN, reference: NaN};

// Used for compatibility purposes - cf setupCompatibilityLayer
const patchedModules = new Map();
const fallbackLocators = [topLevelLocator];

// Matches backslashes of Windows paths
const backwardSlashRegExp = /\\/g;

// Matches if the path must point to a directory (ie ends with /)
const isDirRegExp = /\/$/;

// Matches if the path starts with a valid path qualifier (./, ../, /)
// eslint-disable-next-line no-unused-vars
const isStrictRegExp = /^\.{0,2}/;

// Splits a require request into its components, or return null if the request is a file path
const pathRegExp = /^(?![A-Za-z]:)(?!\.{0,2}(?:\/|$))((?:@[^\/]+\/)?[^\/]+)\/?(.*|)$/;

// Keep a reference around ("module" is a common name in this context, so better rename it to something more significant)
const pnpModule = module;

/**
 * Used to disable the resolution hooks (for when we want to fallback to the previous resolution - we then need
 * a way to "reset" the environment temporarily)
 */

let enableNativeHooks = true;

/**
 * Simple helper function that assign an error code to an error, so that it can more easily be caught and used
 * by third-parties.
 */

function makeError(code, message, data = {}) {
  const error = new Error(message);
  return Object.assign(error, {code, data});
}

/**
 * Ensures that the returned locator isn't a blacklisted one.
 *
 * Blacklisted packages are packages that cannot be used because their dependencies cannot be deduced. This only
 * happens with peer dependencies, which effectively have different sets of dependencies depending on their parents.
 *
 * In order to deambiguate those different sets of dependencies, the Yarn implementation of PnP will generate a
 * symlink for each combination of <package name>/<package version>/<dependent package> it will find, and will
 * blacklist the target of those symlinks. By doing this, we ensure that files loaded through a specific path
 * will always have the same set of dependencies, provided the symlinks are correctly preserved.
 *
 * Unfortunately, some tools do not preserve them, and when it happens PnP isn't able anymore to deduce the set of
 * dependencies based on the path of the file that makes the require calls. But since we've blacklisted those paths,
 * we're able to print a more helpful error message that points out that a third-party package is doing something
 * incompatible!
 */

// eslint-disable-next-line no-unused-vars
function blacklistCheck(locator) {
  if (locator === blacklistedLocator) {
    throw makeError(
      `BLACKLISTED`,
      [
        `A package has been resolved through a blacklisted path - this is usually caused by one of your tools calling`,
        `"realpath" on the return value of "require.resolve". Since the returned values use symlinks to disambiguate`,
        `peer dependencies, they must be passed untransformed to "require".`,
      ].join(` `),
    );
  }

  return locator;
}

let packageInformationStores = new Map([
["@esy-ocaml/esy-installer",
new Map([["0.0.0",
         {
           packageLocation: "/Users/ulrik.strid/.esy/source/i/esy_ocaml__s__esy_installer__0.0.0__e2db2a97/",
           packageDependencies: new Map([["@esy-ocaml/esy-installer",
                                         "0.0.0"]])}]])],
  ["@esy-ocaml/fauxpam",
  new Map([["0.1.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/esy_ocaml__s__fauxpam__0.1.0__a0be5f38/",
             packageDependencies: new Map([["@esy-ocaml/esy-installer",
                                           "0.0.0"],
                                             ["@esy-ocaml/fauxpam", "0.1.0"],
                                             ["@opam/jbuilder",
                                             "opam:transition"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@esy-ocaml/reason",
  new Map([["3.5.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/esy_ocaml__s__reason__3.5.0__61ed5cc1/",
             packageDependencies: new Map([["@esy-ocaml/reason", "3.5.0"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@opam/menhir",
                                             "opam:20190626"],
                                             ["@opam/merlin-extend",
                                             "opam:0.4"],
                                             ["@opam/ocaml-migrate-parsetree",
                                             "opam:1.4.0"],
                                             ["@opam/ocamlfind",
                                             "opam:1.8.0"],
                                             ["@opam/result", "opam:1.4"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@esy-ocaml/substs",
  new Map([["0.0.1",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/esy_ocaml__s__substs__0.0.1__19de1ee1/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"]])}]])],
  ["@esy-packages/esy-openssl",
  new Map([["archive:https://github.com/openssl/openssl/archive/OpenSSL_1_1_1b.tar.gz#sha1:1b09930a6099c6c8fa15dd6c6842e134e65e0a31",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/esy_packages__s__esy_openssl__dad5e2f2/",
             packageDependencies: new Map([["@esy-packages/esy-openssl",
                                           "archive:https://github.com/openssl/openssl/archive/OpenSSL_1_1_1b.tar.gz#sha1:1b09930a6099c6c8fa15dd6c6842e134e65e0a31"]])}]])],
  ["@opam/angstrom",
  new Map([["opam:0.11.2",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__angstrom__opam__c__0.11.2__ac046552/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/angstrom",
                                             "opam:0.11.2"],
                                             ["@opam/bigstringaf",
                                             "opam:0.5.2"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@opam/result", "opam:1.4"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/asn1-combinators",
  new Map([["opam:0.2.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__asn1_combinators__opam__c__0.2.0__157a1a18/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/asn1-combinators",
                                             "opam:0.2.0"],
                                             ["@opam/cstruct", "opam:3.3.0"],
                                             ["@opam/ocamlbuild",
                                             "opam:0.14.0"],
                                             ["@opam/ocamlfind",
                                             "opam:1.8.0"],
                                             ["@opam/ptime", "opam:0.8.5"],
                                             ["@opam/result", "opam:1.4"],
                                             ["@opam/topkg", "opam:1.0.1"],
                                             ["@opam/zarith", "opam:1.7"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/astring",
  new Map([["opam:0.8.3",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__astring__opam__c__0.8.3__3d7df80e/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/astring", "opam:0.8.3"],
                                             ["@opam/base-bytes",
                                             "opam:base"],
                                             ["@opam/ocamlbuild",
                                             "opam:0.14.0"],
                                             ["@opam/ocamlfind",
                                             "opam:1.8.0"],
                                             ["@opam/topkg", "opam:1.0.1"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/atd",
  new Map([["opam:2.0.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__atd__opam__c__2.0.0__0e87ac00/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/atd", "opam:2.0.0"],
                                             ["@opam/easy-format",
                                             "opam:1.3.1"],
                                             ["@opam/jbuilder",
                                             "opam:transition"],
                                             ["@opam/menhir",
                                             "opam:20190626"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/atdgen",
  new Map([["opam:2.0.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__atdgen__opam__c__2.0.0__e38718c7/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/atd", "opam:2.0.0"],
                                             ["@opam/atdgen", "opam:2.0.0"],
                                             ["@opam/atdgen-runtime",
                                             "opam:2.0.0"],
                                             ["@opam/biniou", "opam:1.2.0"],
                                             ["@opam/jbuilder",
                                             "opam:transition"],
                                             ["@opam/yojson", "opam:1.7.0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/atdgen-runtime",
  new Map([["opam:2.0.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__atdgen_runtime__opam__c__2.0.0__fb2d4192/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/atdgen-runtime",
                                             "opam:2.0.0"],
                                             ["@opam/biniou", "opam:1.2.0"],
                                             ["@opam/jbuilder",
                                             "opam:transition"],
                                             ["@opam/yojson", "opam:1.7.0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/base",
  new Map([["opam:v0.11.1",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__base__opam__c__v0.11.1__753e67c0/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/base", "opam:v0.11.1"],
                                             ["@opam/jbuilder",
                                             "opam:transition"],
                                             ["@opam/sexplib0",
                                             "opam:v0.11.0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/base-bigarray",
  new Map([["opam:base",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__base_bigarray__opam__c__base__37a71828/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/base-bigarray",
                                             "opam:base"]])}]])],
  ["@opam/base-bytes",
  new Map([["opam:base",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__base_bytes__opam__c__base__48b6019a/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/base-bytes",
                                             "opam:base"],
                                             ["@opam/ocamlfind",
                                             "opam:1.8.0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/base-threads",
  new Map([["opam:base",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__base_threads__opam__c__base__f282958b/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/base-threads",
                                             "opam:base"]])}]])],
  ["@opam/base-unix",
  new Map([["opam:base",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__base_unix__opam__c__base__93427a57/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/base-unix", "opam:base"]])}]])],
  ["@opam/base64",
  new Map([["opam:3.2.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__base64__opam__c__3.2.0__40c4310e/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/base-bytes",
                                             "opam:base"],
                                             ["@opam/base64", "opam:3.2.0"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/bigarray-compat",
  new Map([["opam:1.0.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__bigarray_compat__opam__c__1.0.0__9d53fd01/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/bigarray-compat",
                                             "opam:1.0.0"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/bigstringaf",
  new Map([["opam:0.5.2",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__bigstringaf__opam__c__0.5.2__02c40bd2/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/base-bigarray",
                                             "opam:base"],
                                             ["@opam/bigstringaf",
                                             "opam:0.5.2"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/biniou",
  new Map([["opam:1.2.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__biniou__opam__c__1.2.0__7c0af8cd/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/biniou", "opam:1.2.0"],
                                             ["@opam/conf-which", "opam:1"],
                                             ["@opam/easy-format",
                                             "opam:1.3.1"],
                                             ["@opam/jbuilder",
                                             "opam:transition"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/bos",
  new Map([["opam:0.2.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__bos__opam__c__0.2.0__7a96f5d8/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/astring", "opam:0.8.3"],
                                             ["@opam/base-unix", "opam:base"],
                                             ["@opam/bos", "opam:0.2.0"],
                                             ["@opam/fmt", "opam:0.8.7"],
                                             ["@opam/fpath", "opam:0.7.2"],
                                             ["@opam/logs", "opam:0.6.3"],
                                             ["@opam/ocamlbuild",
                                             "opam:0.14.0"],
                                             ["@opam/ocamlfind",
                                             "opam:1.8.0"],
                                             ["@opam/rresult", "opam:0.6.0"],
                                             ["@opam/topkg", "opam:1.0.1"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/cmdliner",
  new Map([["opam:1.0.3",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__cmdliner__opam__c__1.0.3__0c3dda01/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/cmdliner", "opam:1.0.3"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/conf-gmp",
  new Map([["opam:1",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__conf_gmp__opam__c__1__5e55e999/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/conf-gmp", "opam:1"],
                                             ["esy-gmp",
                                             "archive:https://gmplib.org/download/gmp/gmp-6.1.2.tar.xz#sha1:9dc6981197a7d92f339192eea974f5eca48fcffe"]])}]])],
  ["@opam/conf-m4",
  new Map([["opam:1",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__conf_m4__opam__c__1__6636816c/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/conf-m4", "opam:1"]])}]])],
  ["@opam/conf-openssl",
  new Map([["no-source:",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__conf_openssl__c9915769/",
             packageDependencies: new Map([["@esy-packages/esy-openssl",
                                           "archive:https://github.com/openssl/openssl/archive/OpenSSL_1_1_1b.tar.gz#sha1:1b09930a6099c6c8fa15dd6c6842e134e65e0a31"],
                                             ["@opam/conf-openssl",
                                             "no-source:"],
                                             ["@opam/conf-pkg-config",
                                             "opam:1.1"]])}]])],
  ["@opam/conf-perl",
  new Map([["opam:1",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__conf_perl__opam__c__1__9fb77902/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/conf-perl", "opam:1"]])}]])],
  ["@opam/conf-pkg-config",
  new Map([["opam:1.1",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__conf_pkg_config__opam__c__1.1__ec6f4a22/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/conf-pkg-config",
                                             "opam:1.1"],
                                             ["yarn-pkg-config",
                                             "github:esy-ocaml/yarn-pkg-config#cca65f99674ed2d954d28788edeb8c57fada5ed0"]])}]])],
  ["@opam/conf-which",
  new Map([["opam:1",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__conf_which__opam__c__1__4eba5e67/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/conf-which", "opam:1"]])}]])],
  ["@opam/containers",
  new Map([["opam:2.6",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__containers__opam__c__2.6__781df12e/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/base-threads",
                                             "opam:base"],
                                             ["@opam/base-unix", "opam:base"],
                                             ["@opam/containers", "opam:2.6"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@opam/result", "opam:1.4"],
                                             ["@opam/uchar", "opam:0.0.2"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/cppo",
  new Map([["opam:1.6.6",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__cppo__opam__c__1.6.6__df887bb2/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/base-unix", "opam:base"],
                                             ["@opam/cppo", "opam:1.6.6"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/cpuid",
  new Map([["opam:0.1.2",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__cpuid__opam__c__0.1.2__bc096a00/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/cpuid", "opam:0.1.2"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/cstruct",
  new Map([["opam:3.3.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__cstruct__opam__c__3.3.0__0352c007/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/cstruct", "opam:3.3.0"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@opam/sexplib",
                                             "opam:v0.11.0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/cstruct-lwt",
  new Map([["opam:5.0.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__cstruct_lwt__opam__c__5.0.0__c814d8b8/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/base-unix", "opam:base"],
                                             ["@opam/cstruct", "opam:3.3.0"],
                                             ["@opam/cstruct-lwt",
                                             "opam:5.0.0"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@opam/lwt", "opam:4.2.1"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/cstruct-sexp",
  new Map([["opam:5.0.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__cstruct_sexp__opam__c__5.0.0__57fb7e44/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/cstruct", "opam:3.3.0"],
                                             ["@opam/cstruct-sexp",
                                             "opam:5.0.0"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@opam/sexplib",
                                             "opam:v0.11.0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/dune",
  new Map([["opam:1.11.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__dune__opam__c__1.11.0__bca7c5f3/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/base-threads",
                                             "opam:base"],
                                             ["@opam/base-unix", "opam:base"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/easy-format",
  new Map([["opam:1.3.1",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__easy_format__opam__c__1.3.1__09dd6fc0/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/easy-format",
                                             "opam:1.3.1"],
                                             ["@opam/jbuilder",
                                             "opam:transition"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/faraday",
  new Map([["opam:0.7.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__faraday__opam__c__0.7.0__d39ebd9e/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/bigstringaf",
                                             "opam:0.5.2"],
                                             ["@opam/faraday", "opam:0.7.0"],
                                             ["@opam/jbuilder",
                                             "opam:transition"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/faraday-lwt",
  new Map([["opam:0.7.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__faraday_lwt__opam__c__0.7.0__fcf1aca9/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/faraday", "opam:0.7.0"],
                                             ["@opam/faraday-lwt",
                                             "opam:0.7.0"],
                                             ["@opam/jbuilder",
                                             "opam:transition"],
                                             ["@opam/lwt", "opam:4.2.1"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/faraday-lwt-unix",
  new Map([["opam:0.7.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__faraday_lwt_unix__opam__c__0.7.0__e934ec70/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/base-unix", "opam:base"],
                                             ["@opam/faraday-lwt",
                                             "opam:0.7.0"],
                                             ["@opam/faraday-lwt-unix",
                                             "opam:0.7.0"],
                                             ["@opam/jbuilder",
                                             "opam:transition"],
                                             ["@opam/lwt", "opam:4.2.1"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/fieldslib",
  new Map([["opam:v0.11.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__fieldslib__opam__c__v0.11.0__b1aef9cb/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/base", "opam:v0.11.1"],
                                             ["@opam/fieldslib",
                                             "opam:v0.11.0"],
                                             ["@opam/jbuilder",
                                             "opam:transition"],
                                             ["@opam/ocaml-migrate-parsetree",
                                             "opam:1.4.0"],
                                             ["@opam/ppxlib", "opam:0.8.1"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/fmt",
  new Map([["opam:0.8.7",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__fmt__opam__c__0.8.7__a5d73f73/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/base-unix", "opam:base"],
                                             ["@opam/cmdliner", "opam:1.0.3"],
                                             ["@opam/fmt", "opam:0.8.7"],
                                             ["@opam/ocamlbuild",
                                             "opam:0.14.0"],
                                             ["@opam/ocamlfind",
                                             "opam:1.8.0"],
                                             ["@opam/seq", "opam:base"],
                                             ["@opam/stdlib-shims",
                                             "opam:0.1.0"],
                                             ["@opam/topkg", "opam:1.0.1"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/fpath",
  new Map([["opam:0.7.2",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__fpath__opam__c__0.7.2__d7c490cc/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/astring", "opam:0.8.3"],
                                             ["@opam/fpath", "opam:0.7.2"],
                                             ["@opam/ocamlbuild",
                                             "opam:0.14.0"],
                                             ["@opam/ocamlfind",
                                             "opam:1.8.0"],
                                             ["@opam/result", "opam:1.4"],
                                             ["@opam/topkg", "opam:1.0.1"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/h2",
  new Map([["opam:0.3.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__h2__opam__c__0.3.0__626bf83d/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/angstrom",
                                             "opam:0.11.2"],
                                             ["@opam/bigstringaf",
                                             "opam:0.5.2"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@opam/faraday", "opam:0.7.0"],
                                             ["@opam/h2", "opam:0.3.0"],
                                             ["@opam/hpack", "opam:0.2.0"],
                                             ["@opam/httpaf",
                                             "github:anmonteiro/httpaf:httpaf.opam#5dff1b4"],
                                             ["@opam/psq", "opam:0.2.0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/h2-lwt",
  new Map([["opam:0.3.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__h2_lwt__opam__c__0.3.0__dec88f79/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@opam/h2", "opam:0.3.0"],
                                             ["@opam/h2-lwt", "opam:0.3.0"],
                                             ["@opam/lwt", "opam:4.2.1"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/h2-lwt-unix",
  new Map([["opam:0.3.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__h2_lwt_unix__opam__c__0.3.0__b9f5555c/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@opam/faraday-lwt-unix",
                                             "opam:0.7.0"],
                                             ["@opam/h2-lwt", "opam:0.3.0"],
                                             ["@opam/h2-lwt-unix",
                                             "opam:0.3.0"],
                                             ["@opam/lwt", "opam:4.2.1"],
                                             ["@opam/lwt_ssl", "opam:1.1.2"],
                                             ["@opam/ocamlfind",
                                             "opam:1.8.0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/hex",
  new Map([["opam:1.4.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__hex__opam__c__1.4.0__433c1f4e/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/bigarray-compat",
                                             "opam:1.0.0"],
                                             ["@opam/cstruct", "opam:3.3.0"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@opam/hex", "opam:1.4.0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/hpack",
  new Map([["opam:0.2.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__hpack__opam__c__0.2.0__d912d60f/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/angstrom",
                                             "opam:0.11.2"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@opam/faraday", "opam:0.7.0"],
                                             ["@opam/hpack", "opam:0.2.0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/httpaf",
  new Map([["github:anmonteiro/httpaf:httpaf.opam#5dff1b4",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__httpaf__1a0d1e7d/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/angstrom",
                                             "opam:0.11.2"],
                                             ["@opam/bigstringaf",
                                             "opam:0.5.2"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@opam/faraday", "opam:0.7.0"],
                                             ["@opam/httpaf",
                                             "github:anmonteiro/httpaf:httpaf.opam#5dff1b4"],
                                             ["@opam/result", "opam:1.4"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/httpaf-lwt",
  new Map([["github:anmonteiro/httpaf:httpaf-lwt.opam#5dff1b4",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__httpaf_lwt__3cad16d2/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@opam/httpaf",
                                             "github:anmonteiro/httpaf:httpaf.opam#5dff1b4"],
                                             ["@opam/httpaf-lwt",
                                             "github:anmonteiro/httpaf:httpaf-lwt.opam#5dff1b4"],
                                             ["@opam/lwt", "opam:4.2.1"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/httpaf-lwt-unix",
  new Map([["github:anmonteiro/httpaf:httpaf-lwt-unix.opam#5dff1b4",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__httpaf_lwt_unix__736ad932/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@opam/faraday-lwt-unix",
                                             "opam:0.7.0"],
                                             ["@opam/httpaf",
                                             "github:anmonteiro/httpaf:httpaf.opam#5dff1b4"],
                                             ["@opam/httpaf-lwt",
                                             "github:anmonteiro/httpaf:httpaf-lwt.opam#5dff1b4"],
                                             ["@opam/httpaf-lwt-unix",
                                             "github:anmonteiro/httpaf:httpaf-lwt-unix.opam#5dff1b4"],
                                             ["@opam/lwt", "opam:4.2.1"],
                                             ["@opam/lwt_ssl", "opam:1.1.2"],
                                             ["@opam/ocamlfind",
                                             "opam:1.8.0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/jbuilder",
  new Map([["opam:transition",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__jbuilder__opam__c__transition__c94246e9/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@opam/jbuilder",
                                             "opam:transition"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/junit",
  new Map([["opam:2.0.1",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__junit__opam__c__2.0.1__d62bd98c/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@opam/junit", "opam:2.0.1"],
                                             ["@opam/ptime", "opam:0.8.5"],
                                             ["@opam/tyxml", "opam:4.3.0"]])}]])],
  ["@opam/logs",
  new Map([["opam:0.6.3",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__logs__opam__c__0.6.3__f0f55b48/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/cmdliner", "opam:1.0.3"],
                                             ["@opam/fmt", "opam:0.8.7"],
                                             ["@opam/logs", "opam:0.6.3"],
                                             ["@opam/lwt", "opam:4.2.1"],
                                             ["@opam/ocamlbuild",
                                             "opam:0.14.0"],
                                             ["@opam/ocamlfind",
                                             "opam:1.8.0"],
                                             ["@opam/topkg", "opam:1.0.1"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/lwt",
  new Map([["opam:4.2.1",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__lwt__opam__c__4.2.1__45de5496/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/base-threads",
                                             "opam:base"],
                                             ["@opam/base-unix", "opam:base"],
                                             ["@opam/cppo", "opam:1.6.6"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@opam/lwt", "opam:4.2.1"],
                                             ["@opam/mmap", "opam:1.1.0"],
                                             ["@opam/result", "opam:1.4"],
                                             ["@opam/seq", "opam:base"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/lwt_ssl",
  new Map([["opam:1.1.2",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__lwt__ssl__opam__c__1.1.2__abbe48a2/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/base-unix", "opam:base"],
                                             ["@opam/jbuilder",
                                             "opam:transition"],
                                             ["@opam/lwt", "opam:4.2.1"],
                                             ["@opam/lwt_ssl", "opam:1.1.2"],
                                             ["@opam/ssl",
                                             "github:savonet/ocaml-ssl:ssl.opam#9dd1cbf71839195e115b8e2438554c530e0f0ed0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/menhir",
  new Map([["opam:20190626",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__menhir__opam__c__20190626__36c87ded/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/menhir",
                                             "opam:20190626"],
                                             ["@opam/ocamlbuild",
                                             "opam:0.14.0"],
                                             ["@opam/ocamlfind",
                                             "opam:1.8.0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/merlin",
  new Map([["opam:3.3.2",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__merlin__opam__c__3.3.2__db58c768/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@opam/merlin", "opam:3.3.2"],
                                             ["@opam/ocamlfind",
                                             "opam:1.8.0"],
                                             ["@opam/yojson", "opam:1.7.0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/merlin-extend",
  new Map([["opam:0.4",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__merlin_extend__opam__c__0.4__a76ff802/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/cppo", "opam:1.6.6"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@opam/merlin-extend",
                                             "opam:0.4"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/mirage-no-solo5",
  new Map([["opam:1",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__mirage_no_solo5__opam__c__1__7988cace/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/mirage-no-solo5",
                                             "opam:1"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/mirage-no-xen",
  new Map([["opam:1",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__mirage_no_xen__opam__c__1__0767ec8e/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/mirage-no-xen",
                                             "opam:1"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/mmap",
  new Map([["opam:1.1.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__mmap__opam__c__1.1.0__65f79d49/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@opam/mmap", "opam:1.1.0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/nocrypto",
  new Map([["github:mirleft/ocaml-nocrypto:opam#ed7bb8d",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__nocrypto__e68575dd/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/cpuid", "opam:0.1.2"],
                                             ["@opam/cstruct", "opam:3.3.0"],
                                             ["@opam/cstruct-lwt",
                                             "opam:5.0.0"],
                                             ["@opam/lwt", "opam:4.2.1"],
                                             ["@opam/mirage-no-solo5",
                                             "opam:1"],
                                             ["@opam/mirage-no-xen",
                                             "opam:1"],
                                             ["@opam/nocrypto",
                                             "github:mirleft/ocaml-nocrypto:opam#ed7bb8d"],
                                             ["@opam/ocamlbuild",
                                             "opam:0.14.0"],
                                             ["@opam/ocamlfind",
                                             "opam:1.8.0"],
                                             ["@opam/ocb-stubblr",
                                             "opam:0.1.1-1"],
                                             ["@opam/ocplib-endian",
                                             "opam:1.0"],
                                             ["@opam/topkg", "opam:1.0.1"],
                                             ["@opam/zarith", "opam:1.7"]])}]])],
  ["@opam/num",
  new Map([["opam:1.2",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__num__opam__c__1.2__8a7cf48c/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/num", "opam:1.2"],
                                             ["@opam/ocamlfind",
                                             "opam:1.8.0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/ocaml-compiler-libs",
  new Map([["opam:v0.12.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__ocaml_compiler_libs__opam__c__v0.12.0__46fc849e/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@opam/ocaml-compiler-libs",
                                             "opam:v0.12.0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/ocaml-migrate-parsetree",
  new Map([["opam:1.4.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__ocaml_migrate_parsetree__opam__c__1.4.0__0ccf6288/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@opam/ocaml-migrate-parsetree",
                                             "opam:1.4.0"],
                                             ["@opam/ppx_derivers",
                                             "opam:1.2.1"],
                                             ["@opam/result", "opam:1.4"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/ocamlbuild",
  new Map([["opam:0.14.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__ocamlbuild__opam__c__0.14.0__56d4d3d9/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/ocamlbuild",
                                             "opam:0.14.0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/ocamlfind",
  new Map([["opam:1.8.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__ocamlfind__opam__c__1.8.0__6ce51c9c/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/conf-m4", "opam:1"],
                                             ["@opam/ocamlfind",
                                             "opam:1.8.0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/ocb-stubblr",
  new Map([["opam:0.1.1-1",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__ocb_stubblr__opam__c__0.1.1_1__51133077/",
             packageDependencies: new Map([["@esy-ocaml/fauxpam", "0.1.0"],
                                             ["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/astring", "opam:0.8.3"],
                                             ["@opam/ocamlbuild",
                                             "opam:0.14.0"],
                                             ["@opam/ocamlfind",
                                             "opam:1.8.0"],
                                             ["@opam/ocb-stubblr",
                                             "opam:0.1.1-1"],
                                             ["@opam/topkg", "opam:1.0.1"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/ocplib-endian",
  new Map([["opam:1.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__ocplib_endian__opam__c__1.0__aceff5fc/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/base-bytes",
                                             "opam:base"],
                                             ["@opam/cppo", "opam:1.6.6"],
                                             ["@opam/ocamlbuild",
                                             "opam:0.14.0"],
                                             ["@opam/ocamlfind",
                                             "opam:1.8.0"],
                                             ["@opam/ocplib-endian",
                                             "opam:1.0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/parsexp",
  new Map([["opam:v0.11.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__parsexp__opam__c__v0.11.0__454acea2/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/jbuilder",
                                             "opam:transition"],
                                             ["@opam/parsexp",
                                             "opam:v0.11.0"],
                                             ["@opam/sexplib0",
                                             "opam:v0.11.0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/ppx_assert",
  new Map([["opam:v0.11.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__ppx__assert__opam__c__v0.11.0__9d9df0b4/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/base", "opam:v0.11.1"],
                                             ["@opam/jbuilder",
                                             "opam:transition"],
                                             ["@opam/ocaml-migrate-parsetree",
                                             "opam:1.4.0"],
                                             ["@opam/ppx_assert",
                                             "opam:v0.11.0"],
                                             ["@opam/ppx_compare",
                                             "opam:v0.11.1"],
                                             ["@opam/ppx_here",
                                             "opam:v0.11.0"],
                                             ["@opam/ppx_sexp_conv",
                                             "opam:v0.11.2"],
                                             ["@opam/ppxlib", "opam:0.8.1"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/ppx_compare",
  new Map([["opam:v0.11.1",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__ppx__compare__opam__c__v0.11.1__35ad9be3/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/base", "opam:v0.11.1"],
                                             ["@opam/jbuilder",
                                             "opam:transition"],
                                             ["@opam/ocaml-migrate-parsetree",
                                             "opam:1.4.0"],
                                             ["@opam/ppx_compare",
                                             "opam:v0.11.1"],
                                             ["@opam/ppxlib", "opam:0.8.1"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/ppx_custom_printf",
  new Map([["opam:v0.11.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__ppx__custom__printf__opam__c__v0.11.0__165dce1b/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/base", "opam:v0.11.1"],
                                             ["@opam/jbuilder",
                                             "opam:transition"],
                                             ["@opam/ocaml-migrate-parsetree",
                                             "opam:1.4.0"],
                                             ["@opam/ppx_custom_printf",
                                             "opam:v0.11.0"],
                                             ["@opam/ppx_sexp_conv",
                                             "opam:v0.11.2"],
                                             ["@opam/ppxlib", "opam:0.8.1"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/ppx_derivers",
  new Map([["opam:1.2.1",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__ppx__derivers__opam__c__1.2.1__cb73e572/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@opam/ppx_derivers",
                                             "opam:1.2.1"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/ppx_expect",
  new Map([["opam:v0.11.1",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__ppx__expect__opam__c__v0.11.1__d926705c/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/base", "opam:v0.11.1"],
                                             ["@opam/jbuilder",
                                             "opam:transition"],
                                             ["@opam/ocaml-migrate-parsetree",
                                             "opam:1.4.0"],
                                             ["@opam/ppx_assert",
                                             "opam:v0.11.0"],
                                             ["@opam/ppx_compare",
                                             "opam:v0.11.1"],
                                             ["@opam/ppx_custom_printf",
                                             "opam:v0.11.0"],
                                             ["@opam/ppx_expect",
                                             "opam:v0.11.1"],
                                             ["@opam/ppx_fields_conv",
                                             "opam:v0.11.0"],
                                             ["@opam/ppx_here",
                                             "opam:v0.11.0"],
                                             ["@opam/ppx_inline_test",
                                             "opam:v0.11.0"],
                                             ["@opam/ppx_sexp_conv",
                                             "opam:v0.11.2"],
                                             ["@opam/ppx_variants_conv",
                                             "opam:v0.11.1"],
                                             ["@opam/ppxlib", "opam:0.8.1"],
                                             ["@opam/re", "opam:1.9.0"],
                                             ["@opam/stdio", "opam:v0.11.0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/ppx_fields_conv",
  new Map([["opam:v0.11.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__ppx__fields__conv__opam__c__v0.11.0__d3384208/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/base", "opam:v0.11.1"],
                                             ["@opam/fieldslib",
                                             "opam:v0.11.0"],
                                             ["@opam/jbuilder",
                                             "opam:transition"],
                                             ["@opam/ocaml-migrate-parsetree",
                                             "opam:1.4.0"],
                                             ["@opam/ppx_fields_conv",
                                             "opam:v0.11.0"],
                                             ["@opam/ppxlib", "opam:0.8.1"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/ppx_here",
  new Map([["opam:v0.11.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__ppx__here__opam__c__v0.11.0__a72e123e/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/base", "opam:v0.11.1"],
                                             ["@opam/jbuilder",
                                             "opam:transition"],
                                             ["@opam/ocaml-migrate-parsetree",
                                             "opam:1.4.0"],
                                             ["@opam/ppx_here",
                                             "opam:v0.11.0"],
                                             ["@opam/ppxlib", "opam:0.8.1"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/ppx_inline_test",
  new Map([["opam:v0.11.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__ppx__inline__test__opam__c__v0.11.0__e620ab72/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/base", "opam:v0.11.1"],
                                             ["@opam/jbuilder",
                                             "opam:transition"],
                                             ["@opam/ocaml-migrate-parsetree",
                                             "opam:1.4.0"],
                                             ["@opam/ppx_inline_test",
                                             "opam:v0.11.0"],
                                             ["@opam/ppxlib", "opam:0.8.1"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/ppx_sexp_conv",
  new Map([["opam:v0.11.2",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__ppx__sexp__conv__opam__c__v0.11.2__5d59fb0c/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/base", "opam:v0.11.1"],
                                             ["@opam/jbuilder",
                                             "opam:transition"],
                                             ["@opam/ocaml-migrate-parsetree",
                                             "opam:1.4.0"],
                                             ["@opam/ppx_sexp_conv",
                                             "opam:v0.11.2"],
                                             ["@opam/ppxlib", "opam:0.8.1"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/ppx_variants_conv",
  new Map([["opam:v0.11.1",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__ppx__variants__conv__opam__c__v0.11.1__62486446/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/base", "opam:v0.11.1"],
                                             ["@opam/jbuilder",
                                             "opam:transition"],
                                             ["@opam/ocaml-migrate-parsetree",
                                             "opam:1.4.0"],
                                             ["@opam/ppx_variants_conv",
                                             "opam:v0.11.1"],
                                             ["@opam/ppxlib", "opam:0.8.1"],
                                             ["@opam/variantslib",
                                             "opam:v0.11.0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/ppxlib",
  new Map([["opam:0.8.1",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__ppxlib__opam__c__0.8.1__c3d39dcb/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/base", "opam:v0.11.1"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@opam/ocaml-compiler-libs",
                                             "opam:v0.12.0"],
                                             ["@opam/ocaml-migrate-parsetree",
                                             "opam:1.4.0"],
                                             ["@opam/ppx_derivers",
                                             "opam:1.2.1"],
                                             ["@opam/ppxlib", "opam:0.8.1"],
                                             ["@opam/stdio", "opam:v0.11.0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/psq",
  new Map([["opam:0.2.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__psq__opam__c__0.2.0__5ae6aead/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@opam/psq", "opam:0.2.0"],
                                             ["@opam/seq", "opam:base"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/ptime",
  new Map([["opam:0.8.5",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__ptime__opam__c__0.8.5__79d19c69/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/ocamlbuild",
                                             "opam:0.14.0"],
                                             ["@opam/ocamlfind",
                                             "opam:1.8.0"],
                                             ["@opam/ptime", "opam:0.8.5"],
                                             ["@opam/result", "opam:1.4"],
                                             ["@opam/topkg", "opam:1.0.1"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/re",
  new Map([["opam:1.9.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__re__opam__c__1.9.0__89b5799b/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@opam/re", "opam:1.9.0"],
                                             ["@opam/seq", "opam:base"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/result",
  new Map([["opam:1.4",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__result__opam__c__1.4__e0ae7523/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@opam/result", "opam:1.4"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/rresult",
  new Map([["opam:0.6.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__rresult__opam__c__0.6.0__108d9e8f/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/ocamlbuild",
                                             "opam:0.14.0"],
                                             ["@opam/ocamlfind",
                                             "opam:1.8.0"],
                                             ["@opam/result", "opam:1.4"],
                                             ["@opam/rresult", "opam:0.6.0"],
                                             ["@opam/topkg", "opam:1.0.1"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/seq",
  new Map([["opam:base",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__seq__opam__c__base__a0c677b1/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/seq", "opam:base"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/sexplib",
  new Map([["opam:v0.11.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__sexplib__opam__c__v0.11.0__35a051d4/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/jbuilder",
                                             "opam:transition"],
                                             ["@opam/num", "opam:1.2"],
                                             ["@opam/parsexp",
                                             "opam:v0.11.0"],
                                             ["@opam/sexplib",
                                             "opam:v0.11.0"],
                                             ["@opam/sexplib0",
                                             "opam:v0.11.0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/sexplib0",
  new Map([["opam:v0.11.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__sexplib0__opam__c__v0.11.0__5e9fa2db/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/jbuilder",
                                             "opam:transition"],
                                             ["@opam/sexplib0",
                                             "opam:v0.11.0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/ssl",
  new Map([["github:savonet/ocaml-ssl:ssl.opam#9dd1cbf71839195e115b8e2438554c530e0f0ed0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__ssl__d2b9082e/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@esy-packages/esy-openssl",
                                             "archive:https://github.com/openssl/openssl/archive/OpenSSL_1_1_1b.tar.gz#sha1:1b09930a6099c6c8fa15dd6c6842e134e65e0a31"],
                                             ["@opam/base-unix", "opam:base"],
                                             ["@opam/conf-openssl",
                                             "no-source:"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@opam/ssl",
                                             "github:savonet/ocaml-ssl:ssl.opam#9dd1cbf71839195e115b8e2438554c530e0f0ed0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/stdio",
  new Map([["opam:v0.11.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__stdio__opam__c__v0.11.0__25484b4c/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/base", "opam:v0.11.1"],
                                             ["@opam/jbuilder",
                                             "opam:transition"],
                                             ["@opam/stdio", "opam:v0.11.0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/stdlib-shims",
  new Map([["opam:0.1.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__stdlib_shims__opam__c__0.1.0__0eb3c4d9/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@opam/stdlib-shims",
                                             "opam:0.1.0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/stringext",
  new Map([["opam:1.6.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__stringext__opam__c__1.6.0__bc9bb8dd/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/base-bytes",
                                             "opam:base"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@opam/stringext",
                                             "opam:1.6.0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/topkg",
  new Map([["opam:1.0.1",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__topkg__opam__c__1.0.1__52846a4c/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/ocamlbuild",
                                             "opam:0.14.0"],
                                             ["@opam/ocamlfind",
                                             "opam:1.8.0"],
                                             ["@opam/topkg", "opam:1.0.1"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/tyxml",
  new Map([["opam:4.3.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__tyxml__opam__c__4.3.0__6bd276b2/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@opam/re", "opam:1.9.0"],
                                             ["@opam/seq", "opam:base"],
                                             ["@opam/tyxml", "opam:4.3.0"],
                                             ["@opam/uutf", "opam:1.0.2"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/uchar",
  new Map([["opam:0.0.2",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__uchar__opam__c__0.0.2__d1ad73a0/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/ocamlbuild",
                                             "opam:0.14.0"],
                                             ["@opam/uchar", "opam:0.0.2"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/uri",
  new Map([["opam:3.0.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__uri__opam__c__3.0.0__7dbf79c8/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@opam/re", "opam:1.9.0"],
                                             ["@opam/stringext",
                                             "opam:1.6.0"],
                                             ["@opam/uri", "opam:3.0.0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/uutf",
  new Map([["opam:1.0.2",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__uutf__opam__c__1.0.2__34474f09/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/cmdliner", "opam:1.0.3"],
                                             ["@opam/ocamlbuild",
                                             "opam:0.14.0"],
                                             ["@opam/ocamlfind",
                                             "opam:1.8.0"],
                                             ["@opam/topkg", "opam:1.0.1"],
                                             ["@opam/uchar", "opam:0.0.2"],
                                             ["@opam/uutf", "opam:1.0.2"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/variantslib",
  new Map([["opam:v0.11.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__variantslib__opam__c__v0.11.0__5f0e7b56/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/base", "opam:v0.11.1"],
                                             ["@opam/jbuilder",
                                             "opam:transition"],
                                             ["@opam/ocaml-migrate-parsetree",
                                             "opam:1.4.0"],
                                             ["@opam/ppxlib", "opam:0.8.1"],
                                             ["@opam/variantslib",
                                             "opam:v0.11.0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/x509",
  new Map([["opam:0.6.3",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__x509__opam__c__0.6.3__afc79132/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/asn1-combinators",
                                             "opam:0.2.0"],
                                             ["@opam/astring", "opam:0.8.3"],
                                             ["@opam/cstruct", "opam:3.3.0"],
                                             ["@opam/cstruct-sexp",
                                             "opam:5.0.0"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@opam/nocrypto",
                                             "github:mirleft/ocaml-nocrypto:opam#ed7bb8d"],
                                             ["@opam/ppx_sexp_conv",
                                             "opam:v0.11.2"],
                                             ["@opam/ptime", "opam:0.8.5"],
                                             ["@opam/sexplib",
                                             "opam:v0.11.0"],
                                             ["@opam/x509", "opam:0.6.3"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/yojson",
  new Map([["opam:1.7.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__yojson__opam__c__1.7.0__397feda6/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/biniou", "opam:1.2.0"],
                                             ["@opam/cppo", "opam:1.6.6"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@opam/easy-format",
                                             "opam:1.3.1"],
                                             ["@opam/yojson", "opam:1.7.0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@opam/zarith",
  new Map([["opam:1.7",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/opam__s__zarith__opam__c__1.7__f626a29b/",
             packageDependencies: new Map([["@esy-ocaml/substs", "0.0.1"],
                                             ["@opam/conf-gmp", "opam:1"],
                                             ["@opam/conf-perl", "opam:1"],
                                             ["@opam/ocamlfind",
                                             "opam:1.8.0"],
                                             ["@opam/zarith", "opam:1.7"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@reason-native/console",
  new Map([["0.1.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/reason_native__s__console__0.1.0__d4af8f3d/",
             packageDependencies: new Map([["@esy-ocaml/reason", "3.5.0"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@reason-native/console",
                                             "0.1.0"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@reason-native/file-context-printer",
  new Map([["0.0.3",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/reason_native__s__file_context_printer__0.0.3__9dea979f/",
             packageDependencies: new Map([["@esy-ocaml/reason", "3.5.0"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@opam/re", "opam:1.9.0"],
                                             ["@reason-native/file-context-printer",
                                             "0.0.3"],
                                             ["@reason-native/pastel",
                                             "0.2.1"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@reason-native/pastel",
  new Map([["0.2.1",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/reason_native__s__pastel__0.2.1__68084b42/",
             packageDependencies: new Map([["@esy-ocaml/reason", "3.5.0"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@reason-native/pastel",
                                             "0.2.1"],
                                             ["ocaml", "4.7.1004"]])}]])],
  ["@reason-native/rely",
  new Map([["3.1.0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/reason_native__s__rely__3.1.0__127b4df7/",
             packageDependencies: new Map([["@esy-ocaml/reason", "3.5.0"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@opam/junit", "opam:2.0.1"],
                                             ["@opam/re", "opam:1.9.0"],
                                             ["@reason-native/file-context-printer",
                                             "0.0.3"],
                                             ["@reason-native/pastel",
                                             "0.2.1"],
                                             ["@reason-native/rely", "3.1.0"],
                                             ["ocaml", "4.7.1004"],
                                             ["refmterr", "3.2.1"]])}]])],
  ["dune",
  new Map([["0.2.1",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/dune__0.2.1__abb33a2c/",
             packageDependencies: new Map([["dune", "0.2.1"]])}]])],
  ["esy-gmp",
  new Map([["archive:https://gmplib.org/download/gmp/gmp-6.1.2.tar.xz#sha1:9dc6981197a7d92f339192eea974f5eca48fcffe",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/esy_gmp__dea0079d/",
             packageDependencies: new Map([["esy-gmp",
                                           "archive:https://gmplib.org/download/gmp/gmp-6.1.2.tar.xz#sha1:9dc6981197a7d92f339192eea974f5eca48fcffe"]])}]])],
  ["ocaml",
  new Map([["4.7.1004",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/ocaml__4.7.1004__d443949a/",
             packageDependencies: new Map([["ocaml", "4.7.1004"]])}]])],
  ["pesy",
  new Map([["github:esy/pesy#ba6359f25621280a8105d2ffc99d75d849c0d95a",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/pesy__7dd08ee4/",
             packageDependencies: new Map([["@esy-ocaml/reason", "3.5.0"],
                                             ["@opam/bos", "opam:0.2.0"],
                                             ["@opam/cmdliner", "opam:1.0.3"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@opam/fpath", "opam:0.7.2"],
                                             ["@opam/ppx_expect",
                                             "opam:v0.11.1"],
                                             ["@opam/ppx_inline_test",
                                             "opam:v0.11.0"],
                                             ["@opam/sexplib",
                                             "opam:v0.11.0"],
                                             ["@opam/yojson", "opam:1.7.0"],
                                             ["@reason-native/pastel",
                                             "0.2.1"],
                                             ["dune", "0.2.1"],
                                             ["ocaml", "4.7.1004"],
                                             ["pesy",
                                             "github:esy/pesy#ba6359f25621280a8105d2ffc99d75d849c0d95a"],
                                             ["refmterr", "3.2.1"]])}]])],
  ["refmterr",
  new Map([["3.2.1",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/refmterr__3.2.1__d7e88d55/",
             packageDependencies: new Map([["@esy-ocaml/reason", "3.5.0"],
                                             ["@opam/atdgen", "opam:2.0.0"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@opam/re", "opam:1.9.0"],
                                             ["@reason-native/console",
                                             "0.1.0"],
                                             ["@reason-native/pastel",
                                             "0.2.1"],
                                             ["ocaml", "4.7.1004"],
                                             ["refmterr", "3.2.1"]])}]])],
  ["yarn-pkg-config",
  new Map([["github:esy-ocaml/yarn-pkg-config#cca65f99674ed2d954d28788edeb8c57fada5ed0",
           {
             packageLocation: "/Users/ulrik.strid/.esy/source/i/yarn_pkg_config__71ddf21f/",
             packageDependencies: new Map([["yarn-pkg-config",
                                           "github:esy-ocaml/yarn-pkg-config#cca65f99674ed2d954d28788edeb8c57fada5ed0"]])}]])],
  [null,
  new Map([[null,
           {
             packageLocation: "/Users/ulrik.strid/Projects/private/reason-guest-login-oidc-client/",
             packageDependencies: new Map([["@esy-ocaml/reason", "3.5.0"],
                                             ["@esy-packages/esy-openssl",
                                             "archive:https://github.com/openssl/openssl/archive/OpenSSL_1_1_1b.tar.gz#sha1:1b09930a6099c6c8fa15dd6c6842e134e65e0a31"],
                                             ["@opam/base64", "opam:3.2.0"],
                                             ["@opam/containers", "opam:2.6"],
                                             ["@opam/cstruct-lwt",
                                             "opam:5.0.0"],
                                             ["@opam/dune", "opam:1.11.0"],
                                             ["@opam/fmt", "opam:0.8.7"],
                                             ["@opam/h2", "opam:0.3.0"],
                                             ["@opam/h2-lwt", "opam:0.3.0"],
                                             ["@opam/h2-lwt-unix",
                                             "opam:0.3.0"],
                                             ["@opam/hex", "opam:1.4.0"],
                                             ["@opam/hpack", "opam:0.2.0"],
                                             ["@opam/httpaf",
                                             "github:anmonteiro/httpaf:httpaf.opam#5dff1b4"],
                                             ["@opam/httpaf-lwt",
                                             "github:anmonteiro/httpaf:httpaf-lwt.opam#5dff1b4"],
                                             ["@opam/httpaf-lwt-unix",
                                             "github:anmonteiro/httpaf:httpaf-lwt-unix.opam#5dff1b4"],
                                             ["@opam/logs", "opam:0.6.3"],
                                             ["@opam/lwt", "opam:4.2.1"],
                                             ["@opam/lwt_ssl", "opam:1.1.2"],
                                             ["@opam/merlin", "opam:3.3.2"],
                                             ["@opam/nocrypto",
                                             "github:mirleft/ocaml-nocrypto:opam#ed7bb8d"],
                                             ["@opam/ssl",
                                             "github:savonet/ocaml-ssl:ssl.opam#9dd1cbf71839195e115b8e2438554c530e0f0ed0"],
                                             ["@opam/uri", "opam:3.0.0"],
                                             ["@opam/x509", "opam:0.6.3"],
                                             ["@opam/yojson", "opam:1.7.0"],
                                             ["@opam/zarith", "opam:1.7"],
                                             ["@reason-native/rely", "3.1.0"],
                                             ["ocaml", "4.7.1004"],
                                             ["pesy",
                                             "github:esy/pesy#ba6359f25621280a8105d2ffc99d75d849c0d95a"],
                                             ["refmterr", "3.2.1"]])}]])]]);

let locatorsByLocations = new Map([
["../../", topLevelLocator],
  ["../../../../../.esy/source/i/dune__0.2.1__abb33a2c/",
  {
    name: "dune",
    reference: "0.2.1"}],
  ["../../../../../.esy/source/i/esy_gmp__dea0079d/",
  {
    name: "esy-gmp",
    reference: "archive:https://gmplib.org/download/gmp/gmp-6.1.2.tar.xz#sha1:9dc6981197a7d92f339192eea974f5eca48fcffe"}],
  ["../../../../../.esy/source/i/esy_ocaml__s__esy_installer__0.0.0__e2db2a97/",
  {
    name: "@esy-ocaml/esy-installer",
    reference: "0.0.0"}],
  ["../../../../../.esy/source/i/esy_ocaml__s__fauxpam__0.1.0__a0be5f38/",
  {
    name: "@esy-ocaml/fauxpam",
    reference: "0.1.0"}],
  ["../../../../../.esy/source/i/esy_ocaml__s__reason__3.5.0__61ed5cc1/",
  {
    name: "@esy-ocaml/reason",
    reference: "3.5.0"}],
  ["../../../../../.esy/source/i/esy_ocaml__s__substs__0.0.1__19de1ee1/",
  {
    name: "@esy-ocaml/substs",
    reference: "0.0.1"}],
  ["../../../../../.esy/source/i/esy_packages__s__esy_openssl__dad5e2f2/",
  {
    name: "@esy-packages/esy-openssl",
    reference: "archive:https://github.com/openssl/openssl/archive/OpenSSL_1_1_1b.tar.gz#sha1:1b09930a6099c6c8fa15dd6c6842e134e65e0a31"}],
  ["../../../../../.esy/source/i/ocaml__4.7.1004__d443949a/",
  {
    name: "ocaml",
    reference: "4.7.1004"}],
  ["../../../../../.esy/source/i/opam__s__angstrom__opam__c__0.11.2__ac046552/",
  {
    name: "@opam/angstrom",
    reference: "opam:0.11.2"}],
  ["../../../../../.esy/source/i/opam__s__asn1_combinators__opam__c__0.2.0__157a1a18/",
  {
    name: "@opam/asn1-combinators",
    reference: "opam:0.2.0"}],
  ["../../../../../.esy/source/i/opam__s__astring__opam__c__0.8.3__3d7df80e/",
  {
    name: "@opam/astring",
    reference: "opam:0.8.3"}],
  ["../../../../../.esy/source/i/opam__s__atd__opam__c__2.0.0__0e87ac00/",
  {
    name: "@opam/atd",
    reference: "opam:2.0.0"}],
  ["../../../../../.esy/source/i/opam__s__atdgen__opam__c__2.0.0__e38718c7/",
  {
    name: "@opam/atdgen",
    reference: "opam:2.0.0"}],
  ["../../../../../.esy/source/i/opam__s__atdgen_runtime__opam__c__2.0.0__fb2d4192/",
  {
    name: "@opam/atdgen-runtime",
    reference: "opam:2.0.0"}],
  ["../../../../../.esy/source/i/opam__s__base64__opam__c__3.2.0__40c4310e/",
  {
    name: "@opam/base64",
    reference: "opam:3.2.0"}],
  ["../../../../../.esy/source/i/opam__s__base__opam__c__v0.11.1__753e67c0/",
  {
    name: "@opam/base",
    reference: "opam:v0.11.1"}],
  ["../../../../../.esy/source/i/opam__s__base_bigarray__opam__c__base__37a71828/",
  {
    name: "@opam/base-bigarray",
    reference: "opam:base"}],
  ["../../../../../.esy/source/i/opam__s__base_bytes__opam__c__base__48b6019a/",
  {
    name: "@opam/base-bytes",
    reference: "opam:base"}],
  ["../../../../../.esy/source/i/opam__s__base_threads__opam__c__base__f282958b/",
  {
    name: "@opam/base-threads",
    reference: "opam:base"}],
  ["../../../../../.esy/source/i/opam__s__base_unix__opam__c__base__93427a57/",
  {
    name: "@opam/base-unix",
    reference: "opam:base"}],
  ["../../../../../.esy/source/i/opam__s__bigarray_compat__opam__c__1.0.0__9d53fd01/",
  {
    name: "@opam/bigarray-compat",
    reference: "opam:1.0.0"}],
  ["../../../../../.esy/source/i/opam__s__bigstringaf__opam__c__0.5.2__02c40bd2/",
  {
    name: "@opam/bigstringaf",
    reference: "opam:0.5.2"}],
  ["../../../../../.esy/source/i/opam__s__biniou__opam__c__1.2.0__7c0af8cd/",
  {
    name: "@opam/biniou",
    reference: "opam:1.2.0"}],
  ["../../../../../.esy/source/i/opam__s__bos__opam__c__0.2.0__7a96f5d8/",
  {
    name: "@opam/bos",
    reference: "opam:0.2.0"}],
  ["../../../../../.esy/source/i/opam__s__cmdliner__opam__c__1.0.3__0c3dda01/",
  {
    name: "@opam/cmdliner",
    reference: "opam:1.0.3"}],
  ["../../../../../.esy/source/i/opam__s__conf_gmp__opam__c__1__5e55e999/",
  {
    name: "@opam/conf-gmp",
    reference: "opam:1"}],
  ["../../../../../.esy/source/i/opam__s__conf_m4__opam__c__1__6636816c/",
  {
    name: "@opam/conf-m4",
    reference: "opam:1"}],
  ["../../../../../.esy/source/i/opam__s__conf_openssl__c9915769/",
  {
    name: "@opam/conf-openssl",
    reference: "no-source:"}],
  ["../../../../../.esy/source/i/opam__s__conf_perl__opam__c__1__9fb77902/",
  {
    name: "@opam/conf-perl",
    reference: "opam:1"}],
  ["../../../../../.esy/source/i/opam__s__conf_pkg_config__opam__c__1.1__ec6f4a22/",
  {
    name: "@opam/conf-pkg-config",
    reference: "opam:1.1"}],
  ["../../../../../.esy/source/i/opam__s__conf_which__opam__c__1__4eba5e67/",
  {
    name: "@opam/conf-which",
    reference: "opam:1"}],
  ["../../../../../.esy/source/i/opam__s__containers__opam__c__2.6__781df12e/",
  {
    name: "@opam/containers",
    reference: "opam:2.6"}],
  ["../../../../../.esy/source/i/opam__s__cppo__opam__c__1.6.6__df887bb2/",
  {
    name: "@opam/cppo",
    reference: "opam:1.6.6"}],
  ["../../../../../.esy/source/i/opam__s__cpuid__opam__c__0.1.2__bc096a00/",
  {
    name: "@opam/cpuid",
    reference: "opam:0.1.2"}],
  ["../../../../../.esy/source/i/opam__s__cstruct__opam__c__3.3.0__0352c007/",
  {
    name: "@opam/cstruct",
    reference: "opam:3.3.0"}],
  ["../../../../../.esy/source/i/opam__s__cstruct_lwt__opam__c__5.0.0__c814d8b8/",
  {
    name: "@opam/cstruct-lwt",
    reference: "opam:5.0.0"}],
  ["../../../../../.esy/source/i/opam__s__cstruct_sexp__opam__c__5.0.0__57fb7e44/",
  {
    name: "@opam/cstruct-sexp",
    reference: "opam:5.0.0"}],
  ["../../../../../.esy/source/i/opam__s__dune__opam__c__1.11.0__bca7c5f3/",
  {
    name: "@opam/dune",
    reference: "opam:1.11.0"}],
  ["../../../../../.esy/source/i/opam__s__easy_format__opam__c__1.3.1__09dd6fc0/",
  {
    name: "@opam/easy-format",
    reference: "opam:1.3.1"}],
  ["../../../../../.esy/source/i/opam__s__faraday__opam__c__0.7.0__d39ebd9e/",
  {
    name: "@opam/faraday",
    reference: "opam:0.7.0"}],
  ["../../../../../.esy/source/i/opam__s__faraday_lwt__opam__c__0.7.0__fcf1aca9/",
  {
    name: "@opam/faraday-lwt",
    reference: "opam:0.7.0"}],
  ["../../../../../.esy/source/i/opam__s__faraday_lwt_unix__opam__c__0.7.0__e934ec70/",
  {
    name: "@opam/faraday-lwt-unix",
    reference: "opam:0.7.0"}],
  ["../../../../../.esy/source/i/opam__s__fieldslib__opam__c__v0.11.0__b1aef9cb/",
  {
    name: "@opam/fieldslib",
    reference: "opam:v0.11.0"}],
  ["../../../../../.esy/source/i/opam__s__fmt__opam__c__0.8.7__a5d73f73/",
  {
    name: "@opam/fmt",
    reference: "opam:0.8.7"}],
  ["../../../../../.esy/source/i/opam__s__fpath__opam__c__0.7.2__d7c490cc/",
  {
    name: "@opam/fpath",
    reference: "opam:0.7.2"}],
  ["../../../../../.esy/source/i/opam__s__h2__opam__c__0.3.0__626bf83d/",
  {
    name: "@opam/h2",
    reference: "opam:0.3.0"}],
  ["../../../../../.esy/source/i/opam__s__h2_lwt__opam__c__0.3.0__dec88f79/",
  {
    name: "@opam/h2-lwt",
    reference: "opam:0.3.0"}],
  ["../../../../../.esy/source/i/opam__s__h2_lwt_unix__opam__c__0.3.0__b9f5555c/",
  {
    name: "@opam/h2-lwt-unix",
    reference: "opam:0.3.0"}],
  ["../../../../../.esy/source/i/opam__s__hex__opam__c__1.4.0__433c1f4e/",
  {
    name: "@opam/hex",
    reference: "opam:1.4.0"}],
  ["../../../../../.esy/source/i/opam__s__hpack__opam__c__0.2.0__d912d60f/",
  {
    name: "@opam/hpack",
    reference: "opam:0.2.0"}],
  ["../../../../../.esy/source/i/opam__s__httpaf__1a0d1e7d/",
  {
    name: "@opam/httpaf",
    reference: "github:anmonteiro/httpaf:httpaf.opam#5dff1b4"}],
  ["../../../../../.esy/source/i/opam__s__httpaf_lwt__3cad16d2/",
  {
    name: "@opam/httpaf-lwt",
    reference: "github:anmonteiro/httpaf:httpaf-lwt.opam#5dff1b4"}],
  ["../../../../../.esy/source/i/opam__s__httpaf_lwt_unix__736ad932/",
  {
    name: "@opam/httpaf-lwt-unix",
    reference: "github:anmonteiro/httpaf:httpaf-lwt-unix.opam#5dff1b4"}],
  ["../../../../../.esy/source/i/opam__s__jbuilder__opam__c__transition__c94246e9/",
  {
    name: "@opam/jbuilder",
    reference: "opam:transition"}],
  ["../../../../../.esy/source/i/opam__s__junit__opam__c__2.0.1__d62bd98c/",
  {
    name: "@opam/junit",
    reference: "opam:2.0.1"}],
  ["../../../../../.esy/source/i/opam__s__logs__opam__c__0.6.3__f0f55b48/",
  {
    name: "@opam/logs",
    reference: "opam:0.6.3"}],
  ["../../../../../.esy/source/i/opam__s__lwt__opam__c__4.2.1__45de5496/",
  {
    name: "@opam/lwt",
    reference: "opam:4.2.1"}],
  ["../../../../../.esy/source/i/opam__s__lwt__ssl__opam__c__1.1.2__abbe48a2/",
  {
    name: "@opam/lwt_ssl",
    reference: "opam:1.1.2"}],
  ["../../../../../.esy/source/i/opam__s__menhir__opam__c__20190626__36c87ded/",
  {
    name: "@opam/menhir",
    reference: "opam:20190626"}],
  ["../../../../../.esy/source/i/opam__s__merlin__opam__c__3.3.2__db58c768/",
  {
    name: "@opam/merlin",
    reference: "opam:3.3.2"}],
  ["../../../../../.esy/source/i/opam__s__merlin_extend__opam__c__0.4__a76ff802/",
  {
    name: "@opam/merlin-extend",
    reference: "opam:0.4"}],
  ["../../../../../.esy/source/i/opam__s__mirage_no_solo5__opam__c__1__7988cace/",
  {
    name: "@opam/mirage-no-solo5",
    reference: "opam:1"}],
  ["../../../../../.esy/source/i/opam__s__mirage_no_xen__opam__c__1__0767ec8e/",
  {
    name: "@opam/mirage-no-xen",
    reference: "opam:1"}],
  ["../../../../../.esy/source/i/opam__s__mmap__opam__c__1.1.0__65f79d49/",
  {
    name: "@opam/mmap",
    reference: "opam:1.1.0"}],
  ["../../../../../.esy/source/i/opam__s__nocrypto__e68575dd/",
  {
    name: "@opam/nocrypto",
    reference: "github:mirleft/ocaml-nocrypto:opam#ed7bb8d"}],
  ["../../../../../.esy/source/i/opam__s__num__opam__c__1.2__8a7cf48c/",
  {
    name: "@opam/num",
    reference: "opam:1.2"}],
  ["../../../../../.esy/source/i/opam__s__ocaml_compiler_libs__opam__c__v0.12.0__46fc849e/",
  {
    name: "@opam/ocaml-compiler-libs",
    reference: "opam:v0.12.0"}],
  ["../../../../../.esy/source/i/opam__s__ocaml_migrate_parsetree__opam__c__1.4.0__0ccf6288/",
  {
    name: "@opam/ocaml-migrate-parsetree",
    reference: "opam:1.4.0"}],
  ["../../../../../.esy/source/i/opam__s__ocamlbuild__opam__c__0.14.0__56d4d3d9/",
  {
    name: "@opam/ocamlbuild",
    reference: "opam:0.14.0"}],
  ["../../../../../.esy/source/i/opam__s__ocamlfind__opam__c__1.8.0__6ce51c9c/",
  {
    name: "@opam/ocamlfind",
    reference: "opam:1.8.0"}],
  ["../../../../../.esy/source/i/opam__s__ocb_stubblr__opam__c__0.1.1_1__51133077/",
  {
    name: "@opam/ocb-stubblr",
    reference: "opam:0.1.1-1"}],
  ["../../../../../.esy/source/i/opam__s__ocplib_endian__opam__c__1.0__aceff5fc/",
  {
    name: "@opam/ocplib-endian",
    reference: "opam:1.0"}],
  ["../../../../../.esy/source/i/opam__s__parsexp__opam__c__v0.11.0__454acea2/",
  {
    name: "@opam/parsexp",
    reference: "opam:v0.11.0"}],
  ["../../../../../.esy/source/i/opam__s__ppx__assert__opam__c__v0.11.0__9d9df0b4/",
  {
    name: "@opam/ppx_assert",
    reference: "opam:v0.11.0"}],
  ["../../../../../.esy/source/i/opam__s__ppx__compare__opam__c__v0.11.1__35ad9be3/",
  {
    name: "@opam/ppx_compare",
    reference: "opam:v0.11.1"}],
  ["../../../../../.esy/source/i/opam__s__ppx__custom__printf__opam__c__v0.11.0__165dce1b/",
  {
    name: "@opam/ppx_custom_printf",
    reference: "opam:v0.11.0"}],
  ["../../../../../.esy/source/i/opam__s__ppx__derivers__opam__c__1.2.1__cb73e572/",
  {
    name: "@opam/ppx_derivers",
    reference: "opam:1.2.1"}],
  ["../../../../../.esy/source/i/opam__s__ppx__expect__opam__c__v0.11.1__d926705c/",
  {
    name: "@opam/ppx_expect",
    reference: "opam:v0.11.1"}],
  ["../../../../../.esy/source/i/opam__s__ppx__fields__conv__opam__c__v0.11.0__d3384208/",
  {
    name: "@opam/ppx_fields_conv",
    reference: "opam:v0.11.0"}],
  ["../../../../../.esy/source/i/opam__s__ppx__here__opam__c__v0.11.0__a72e123e/",
  {
    name: "@opam/ppx_here",
    reference: "opam:v0.11.0"}],
  ["../../../../../.esy/source/i/opam__s__ppx__inline__test__opam__c__v0.11.0__e620ab72/",
  {
    name: "@opam/ppx_inline_test",
    reference: "opam:v0.11.0"}],
  ["../../../../../.esy/source/i/opam__s__ppx__sexp__conv__opam__c__v0.11.2__5d59fb0c/",
  {
    name: "@opam/ppx_sexp_conv",
    reference: "opam:v0.11.2"}],
  ["../../../../../.esy/source/i/opam__s__ppx__variants__conv__opam__c__v0.11.1__62486446/",
  {
    name: "@opam/ppx_variants_conv",
    reference: "opam:v0.11.1"}],
  ["../../../../../.esy/source/i/opam__s__ppxlib__opam__c__0.8.1__c3d39dcb/",
  {
    name: "@opam/ppxlib",
    reference: "opam:0.8.1"}],
  ["../../../../../.esy/source/i/opam__s__psq__opam__c__0.2.0__5ae6aead/",
  {
    name: "@opam/psq",
    reference: "opam:0.2.0"}],
  ["../../../../../.esy/source/i/opam__s__ptime__opam__c__0.8.5__79d19c69/",
  {
    name: "@opam/ptime",
    reference: "opam:0.8.5"}],
  ["../../../../../.esy/source/i/opam__s__re__opam__c__1.9.0__89b5799b/",
  {
    name: "@opam/re",
    reference: "opam:1.9.0"}],
  ["../../../../../.esy/source/i/opam__s__result__opam__c__1.4__e0ae7523/",
  {
    name: "@opam/result",
    reference: "opam:1.4"}],
  ["../../../../../.esy/source/i/opam__s__rresult__opam__c__0.6.0__108d9e8f/",
  {
    name: "@opam/rresult",
    reference: "opam:0.6.0"}],
  ["../../../../../.esy/source/i/opam__s__seq__opam__c__base__a0c677b1/",
  {
    name: "@opam/seq",
    reference: "opam:base"}],
  ["../../../../../.esy/source/i/opam__s__sexplib0__opam__c__v0.11.0__5e9fa2db/",
  {
    name: "@opam/sexplib0",
    reference: "opam:v0.11.0"}],
  ["../../../../../.esy/source/i/opam__s__sexplib__opam__c__v0.11.0__35a051d4/",
  {
    name: "@opam/sexplib",
    reference: "opam:v0.11.0"}],
  ["../../../../../.esy/source/i/opam__s__ssl__d2b9082e/",
  {
    name: "@opam/ssl",
    reference: "github:savonet/ocaml-ssl:ssl.opam#9dd1cbf71839195e115b8e2438554c530e0f0ed0"}],
  ["../../../../../.esy/source/i/opam__s__stdio__opam__c__v0.11.0__25484b4c/",
  {
    name: "@opam/stdio",
    reference: "opam:v0.11.0"}],
  ["../../../../../.esy/source/i/opam__s__stdlib_shims__opam__c__0.1.0__0eb3c4d9/",
  {
    name: "@opam/stdlib-shims",
    reference: "opam:0.1.0"}],
  ["../../../../../.esy/source/i/opam__s__stringext__opam__c__1.6.0__bc9bb8dd/",
  {
    name: "@opam/stringext",
    reference: "opam:1.6.0"}],
  ["../../../../../.esy/source/i/opam__s__topkg__opam__c__1.0.1__52846a4c/",
  {
    name: "@opam/topkg",
    reference: "opam:1.0.1"}],
  ["../../../../../.esy/source/i/opam__s__tyxml__opam__c__4.3.0__6bd276b2/",
  {
    name: "@opam/tyxml",
    reference: "opam:4.3.0"}],
  ["../../../../../.esy/source/i/opam__s__uchar__opam__c__0.0.2__d1ad73a0/",
  {
    name: "@opam/uchar",
    reference: "opam:0.0.2"}],
  ["../../../../../.esy/source/i/opam__s__uri__opam__c__3.0.0__7dbf79c8/",
  {
    name: "@opam/uri",
    reference: "opam:3.0.0"}],
  ["../../../../../.esy/source/i/opam__s__uutf__opam__c__1.0.2__34474f09/",
  {
    name: "@opam/uutf",
    reference: "opam:1.0.2"}],
  ["../../../../../.esy/source/i/opam__s__variantslib__opam__c__v0.11.0__5f0e7b56/",
  {
    name: "@opam/variantslib",
    reference: "opam:v0.11.0"}],
  ["../../../../../.esy/source/i/opam__s__x509__opam__c__0.6.3__afc79132/",
  {
    name: "@opam/x509",
    reference: "opam:0.6.3"}],
  ["../../../../../.esy/source/i/opam__s__yojson__opam__c__1.7.0__397feda6/",
  {
    name: "@opam/yojson",
    reference: "opam:1.7.0"}],
  ["../../../../../.esy/source/i/opam__s__zarith__opam__c__1.7__f626a29b/",
  {
    name: "@opam/zarith",
    reference: "opam:1.7"}],
  ["../../../../../.esy/source/i/pesy__7dd08ee4/",
  {
    name: "pesy",
    reference: "github:esy/pesy#ba6359f25621280a8105d2ffc99d75d849c0d95a"}],
  ["../../../../../.esy/source/i/reason_native__s__console__0.1.0__d4af8f3d/",
  {
    name: "@reason-native/console",
    reference: "0.1.0"}],
  ["../../../../../.esy/source/i/reason_native__s__file_context_printer__0.0.3__9dea979f/",
  {
    name: "@reason-native/file-context-printer",
    reference: "0.0.3"}],
  ["../../../../../.esy/source/i/reason_native__s__pastel__0.2.1__68084b42/",
  {
    name: "@reason-native/pastel",
    reference: "0.2.1"}],
  ["../../../../../.esy/source/i/reason_native__s__rely__3.1.0__127b4df7/",
  {
    name: "@reason-native/rely",
    reference: "3.1.0"}],
  ["../../../../../.esy/source/i/refmterr__3.2.1__d7e88d55/",
  {
    name: "refmterr",
    reference: "3.2.1"}],
  ["../../../../../.esy/source/i/yarn_pkg_config__71ddf21f/",
  {
    name: "yarn-pkg-config",
    reference: "github:esy-ocaml/yarn-pkg-config#cca65f99674ed2d954d28788edeb8c57fada5ed0"}]]);


  exports.findPackageLocator = function findPackageLocator(location) {
    let relativeLocation = normalizePath(path.relative(__dirname, location));

    if (!relativeLocation.match(isStrictRegExp))
      relativeLocation = `./${relativeLocation}`;

    if (location.match(isDirRegExp) && relativeLocation.charAt(relativeLocation.length - 1) !== '/')
      relativeLocation = `${relativeLocation}/`;

    let match;

  
      if (relativeLocation.length >= 88 && relativeLocation[87] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 88)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 86 && relativeLocation[85] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 86)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 85 && relativeLocation[84] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 85)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 84 && relativeLocation[83] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 84)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 82 && relativeLocation[81] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 82)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 81 && relativeLocation[80] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 81)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 80 && relativeLocation[79] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 80)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 79 && relativeLocation[78] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 79)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 78 && relativeLocation[77] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 78)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 77 && relativeLocation[76] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 77)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 76 && relativeLocation[75] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 76)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 75 && relativeLocation[74] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 75)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 74 && relativeLocation[73] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 74)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 73 && relativeLocation[72] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 73)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 72 && relativeLocation[71] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 72)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 71 && relativeLocation[70] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 71)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 70 && relativeLocation[69] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 70)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 69 && relativeLocation[68] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 69)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 68 && relativeLocation[67] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 68)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 67 && relativeLocation[66] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 67)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 66 && relativeLocation[65] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 66)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 64 && relativeLocation[63] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 64)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 61 && relativeLocation[60] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 61)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 59 && relativeLocation[58] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 59)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 57 && relativeLocation[56] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 57)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 55 && relativeLocation[54] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 55)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 52 && relativeLocation[51] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 52)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 51 && relativeLocation[50] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 51)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 47 && relativeLocation[46] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 47)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 44 && relativeLocation[43] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 44)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 6 && relativeLocation[5] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 6)))
          return blacklistCheck(match);
      

    return null;
  };
  

/**
 * Returns the module that should be used to resolve require calls. It's usually the direct parent, except if we're
 * inside an eval expression.
 */

function getIssuerModule(parent) {
  let issuer = parent;

  while (issuer && (issuer.id === '[eval]' || issuer.id === '<repl>' || !issuer.filename)) {
    issuer = issuer.parent;
  }

  return issuer;
}

/**
 * Returns information about a package in a safe way (will throw if they cannot be retrieved)
 */

function getPackageInformationSafe(packageLocator) {
  const packageInformation = exports.getPackageInformation(packageLocator);

  if (!packageInformation) {
    throw makeError(
      `INTERNAL`,
      `Couldn't find a matching entry in the dependency tree for the specified parent (this is probably an internal error)`,
    );
  }

  return packageInformation;
}

/**
 * Implements the node resolution for folder access and extension selection
 */

function applyNodeExtensionResolution(unqualifiedPath, {extensions}) {
  // We use this "infinite while" so that we can restart the process as long as we hit package folders
  while (true) {
    let stat;

    try {
      stat = statSync(unqualifiedPath);
    } catch (error) {}

    // If the file exists and is a file, we can stop right there

    if (stat && !stat.isDirectory()) {
      // If the very last component of the resolved path is a symlink to a file, we then resolve it to a file. We only
      // do this first the last component, and not the rest of the path! This allows us to support the case of bin
      // symlinks, where a symlink in "/xyz/pkg-name/.bin/bin-name" will point somewhere else (like "/xyz/pkg-name/index.js").
      // In such a case, we want relative requires to be resolved relative to "/xyz/pkg-name/" rather than "/xyz/pkg-name/.bin/".
      //
      // Also note that the reason we must use readlink on the last component (instead of realpath on the whole path)
      // is that we must preserve the other symlinks, in particular those used by pnp to deambiguate packages using
      // peer dependencies. For example, "/xyz/.pnp/local/pnp-01234569/.bin/bin-name" should see its relative requires
      // be resolved relative to "/xyz/.pnp/local/pnp-0123456789/" rather than "/xyz/pkg-with-peers/", because otherwise
      // we would lose the information that would tell us what are the dependencies of pkg-with-peers relative to its
      // ancestors.

      if (lstatSync(unqualifiedPath).isSymbolicLink()) {
        unqualifiedPath = path.normalize(path.resolve(path.dirname(unqualifiedPath), readlinkSync(unqualifiedPath)));
      }

      return unqualifiedPath;
    }

    // If the file is a directory, we must check if it contains a package.json with a "main" entry

    if (stat && stat.isDirectory()) {
      let pkgJson;

      try {
        pkgJson = JSON.parse(readFileSync(`${unqualifiedPath}/package.json`, 'utf-8'));
      } catch (error) {}

      let nextUnqualifiedPath;

      if (pkgJson && pkgJson.main) {
        nextUnqualifiedPath = path.resolve(unqualifiedPath, pkgJson.main);
      }

      // If the "main" field changed the path, we start again from this new location

      if (nextUnqualifiedPath && nextUnqualifiedPath !== unqualifiedPath) {
        unqualifiedPath = nextUnqualifiedPath;
        continue;
      }
    }

    // Otherwise we check if we find a file that match one of the supported extensions

    const qualifiedPath = extensions
      .map(extension => {
        return `${unqualifiedPath}${extension}`;
      })
      .find(candidateFile => {
        return existsSync(candidateFile);
      });

    if (qualifiedPath) {
      return qualifiedPath;
    }

    // Otherwise, we check if the path is a folder - in such a case, we try to use its index

    if (stat && stat.isDirectory()) {
      const indexPath = extensions
        .map(extension => {
          return `${unqualifiedPath}/index${extension}`;
        })
        .find(candidateFile => {
          return existsSync(candidateFile);
        });

      if (indexPath) {
        return indexPath;
      }
    }

    // Otherwise there's nothing else we can do :(

    return null;
  }
}

/**
 * This function creates fake modules that can be used with the _resolveFilename function.
 * Ideally it would be nice to be able to avoid this, since it causes useless allocations
 * and cannot be cached efficiently (we recompute the nodeModulePaths every time).
 *
 * Fortunately, this should only affect the fallback, and there hopefully shouldn't be a
 * lot of them.
 */

function makeFakeModule(path) {
  const fakeModule = new Module(path, false);
  fakeModule.filename = path;
  fakeModule.paths = Module._nodeModulePaths(path);
  return fakeModule;
}

/**
 * Normalize path to posix format.
 */

// eslint-disable-next-line no-unused-vars
function normalizePath(fsPath) {
  return process.platform === 'win32' ? fsPath.replace(backwardSlashRegExp, '/') : fsPath;
}

/**
 * Forward the resolution to the next resolver (usually the native one)
 */

function callNativeResolution(request, issuer) {
  if (issuer.endsWith('/')) {
    issuer += 'internal.js';
  }

  try {
    enableNativeHooks = false;

    // Since we would need to create a fake module anyway (to call _resolveLookupPath that
    // would give us the paths to give to _resolveFilename), we can as well not use
    // the {paths} option at all, since it internally makes _resolveFilename create another
    // fake module anyway.
    return Module._resolveFilename(request, makeFakeModule(issuer), false);
  } finally {
    enableNativeHooks = true;
  }
}

/**
 * This key indicates which version of the standard is implemented by this resolver. The `std` key is the
 * Plug'n'Play standard, and any other key are third-party extensions. Third-party extensions are not allowed
 * to override the standard, and can only offer new methods.
 *
 * If an new version of the Plug'n'Play standard is released and some extensions conflict with newly added
 * functions, they'll just have to fix the conflicts and bump their own version number.
 */

exports.VERSIONS = {std: 1};

/**
 * Useful when used together with getPackageInformation to fetch information about the top-level package.
 */

exports.topLevel = {name: null, reference: null};

/**
 * Gets the package information for a given locator. Returns null if they cannot be retrieved.
 */

exports.getPackageInformation = function getPackageInformation({name, reference}) {
  const packageInformationStore = packageInformationStores.get(name);

  if (!packageInformationStore) {
    return null;
  }

  const packageInformation = packageInformationStore.get(reference);

  if (!packageInformation) {
    return null;
  }

  return packageInformation;
};

/**
 * Transforms a request (what's typically passed as argument to the require function) into an unqualified path.
 * This path is called "unqualified" because it only changes the package name to the package location on the disk,
 * which means that the end result still cannot be directly accessed (for example, it doesn't try to resolve the
 * file extension, or to resolve directories to their "index.js" content). Use the "resolveUnqualified" function
 * to convert them to fully-qualified paths, or just use "resolveRequest" that do both operations in one go.
 *
 * Note that it is extremely important that the `issuer` path ends with a forward slash if the issuer is to be
 * treated as a folder (ie. "/tmp/foo/" rather than "/tmp/foo" if "foo" is a directory). Otherwise relative
 * imports won't be computed correctly (they'll get resolved relative to "/tmp/" instead of "/tmp/foo/").
 */

exports.resolveToUnqualified = function resolveToUnqualified(request, issuer, {considerBuiltins = true} = {}) {
  // Bailout if the request is a native module

  if (considerBuiltins && builtinModules.has(request)) {
    return null;
  }

  // We allow disabling the pnp resolution for some subpaths. This is because some projects, often legacy,
  // contain multiple levels of dependencies (ie. a yarn.lock inside a subfolder of a yarn.lock). This is
  // typically solved using workspaces, but not all of them have been converted already.

  if (ignorePattern && ignorePattern.test(issuer)) {
    const result = callNativeResolution(request, issuer);

    if (result === false) {
      throw makeError(
        `BUILTIN_NODE_RESOLUTION_FAIL`,
        `The builtin node resolution algorithm was unable to resolve the module referenced by "${request}" and requested from "${issuer}" (it didn't go through the pnp resolver because the issuer was explicitely ignored by the regexp "$$BLACKLIST")`,
        {
          request,
          issuer,
        },
      );
    }

    return result;
  }

  let unqualifiedPath;

  // If the request is a relative or absolute path, we just return it normalized

  const dependencyNameMatch = request.match(pathRegExp);

  if (!dependencyNameMatch) {
    if (path.isAbsolute(request)) {
      unqualifiedPath = path.normalize(request);
    } else if (issuer.match(isDirRegExp)) {
      unqualifiedPath = path.normalize(path.resolve(issuer, request));
    } else {
      unqualifiedPath = path.normalize(path.resolve(path.dirname(issuer), request));
    }
  }

  // Things are more hairy if it's a package require - we then need to figure out which package is needed, and in
  // particular the exact version for the given location on the dependency tree

  if (dependencyNameMatch) {
    const [, dependencyName, subPath] = dependencyNameMatch;

    const issuerLocator = exports.findPackageLocator(issuer);

    // If the issuer file doesn't seem to be owned by a package managed through pnp, then we resort to using the next
    // resolution algorithm in the chain, usually the native Node resolution one

    if (!issuerLocator) {
      const result = callNativeResolution(request, issuer);

      if (result === false) {
        throw makeError(
          `BUILTIN_NODE_RESOLUTION_FAIL`,
          `The builtin node resolution algorithm was unable to resolve the module referenced by "${request}" and requested from "${issuer}" (it didn't go through the pnp resolver because the issuer doesn't seem to be part of the Yarn-managed dependency tree)`,
          {
            request,
            issuer,
          },
        );
      }

      return result;
    }

    const issuerInformation = getPackageInformationSafe(issuerLocator);

    // We obtain the dependency reference in regard to the package that request it

    let dependencyReference = issuerInformation.packageDependencies.get(dependencyName);

    // If we can't find it, we check if we can potentially load it from the packages that have been defined as potential fallbacks.
    // It's a bit of a hack, but it improves compatibility with the existing Node ecosystem. Hopefully we should eventually be able
    // to kill this logic and become stricter once pnp gets enough traction and the affected packages fix themselves.

    if (issuerLocator !== topLevelLocator) {
      for (let t = 0, T = fallbackLocators.length; dependencyReference === undefined && t < T; ++t) {
        const fallbackInformation = getPackageInformationSafe(fallbackLocators[t]);
        dependencyReference = fallbackInformation.packageDependencies.get(dependencyName);
      }
    }

    // If we can't find the path, and if the package making the request is the top-level, we can offer nicer error messages

    if (!dependencyReference) {
      if (dependencyReference === null) {
        if (issuerLocator === topLevelLocator) {
          throw makeError(
            `MISSING_PEER_DEPENDENCY`,
            `You seem to be requiring a peer dependency ("${dependencyName}"), but it is not installed (which might be because you're the top-level package)`,
            {request, issuer, dependencyName},
          );
        } else {
          throw makeError(
            `MISSING_PEER_DEPENDENCY`,
            `Package "${issuerLocator.name}@${issuerLocator.reference}" is trying to access a peer dependency ("${dependencyName}") that should be provided by its direct ancestor but isn't`,
            {request, issuer, issuerLocator: Object.assign({}, issuerLocator), dependencyName},
          );
        }
      } else {
        if (issuerLocator === topLevelLocator) {
          throw makeError(
            `UNDECLARED_DEPENDENCY`,
            `You cannot require a package ("${dependencyName}") that is not declared in your dependencies (via "${issuer}")`,
            {request, issuer, dependencyName},
          );
        } else {
          const candidates = Array.from(issuerInformation.packageDependencies.keys());
          throw makeError(
            `UNDECLARED_DEPENDENCY`,
            `Package "${issuerLocator.name}@${issuerLocator.reference}" (via "${issuer}") is trying to require the package "${dependencyName}" (via "${request}") without it being listed in its dependencies (${candidates.join(
              `, `,
            )})`,
            {request, issuer, issuerLocator: Object.assign({}, issuerLocator), dependencyName, candidates},
          );
        }
      }
    }

    // We need to check that the package exists on the filesystem, because it might not have been installed

    const dependencyLocator = {name: dependencyName, reference: dependencyReference};
    const dependencyInformation = exports.getPackageInformation(dependencyLocator);
    const dependencyLocation = path.resolve(__dirname, dependencyInformation.packageLocation);

    if (!dependencyLocation) {
      throw makeError(
        `MISSING_DEPENDENCY`,
        `Package "${dependencyLocator.name}@${dependencyLocator.reference}" is a valid dependency, but hasn't been installed and thus cannot be required (it might be caused if you install a partial tree, such as on production environments)`,
        {request, issuer, dependencyLocator: Object.assign({}, dependencyLocator)},
      );
    }

    // Now that we know which package we should resolve to, we only have to find out the file location

    if (subPath) {
      unqualifiedPath = path.resolve(dependencyLocation, subPath);
    } else {
      unqualifiedPath = dependencyLocation;
    }
  }

  return path.normalize(unqualifiedPath);
};

/**
 * Transforms an unqualified path into a qualified path by using the Node resolution algorithm (which automatically
 * appends ".js" / ".json", and transforms directory accesses into "index.js").
 */

exports.resolveUnqualified = function resolveUnqualified(
  unqualifiedPath,
  {extensions = Object.keys(Module._extensions)} = {},
) {
  const qualifiedPath = applyNodeExtensionResolution(unqualifiedPath, {extensions});

  if (qualifiedPath) {
    return path.normalize(qualifiedPath);
  } else {
    throw makeError(
      `QUALIFIED_PATH_RESOLUTION_FAILED`,
      `Couldn't find a suitable Node resolution for unqualified path "${unqualifiedPath}"`,
      {unqualifiedPath},
    );
  }
};

/**
 * Transforms a request into a fully qualified path.
 *
 * Note that it is extremely important that the `issuer` path ends with a forward slash if the issuer is to be
 * treated as a folder (ie. "/tmp/foo/" rather than "/tmp/foo" if "foo" is a directory). Otherwise relative
 * imports won't be computed correctly (they'll get resolved relative to "/tmp/" instead of "/tmp/foo/").
 */

exports.resolveRequest = function resolveRequest(request, issuer, {considerBuiltins, extensions} = {}) {
  let unqualifiedPath;

  try {
    unqualifiedPath = exports.resolveToUnqualified(request, issuer, {considerBuiltins});
  } catch (originalError) {
    // If we get a BUILTIN_NODE_RESOLUTION_FAIL error there, it means that we've had to use the builtin node
    // resolution, which usually shouldn't happen. It might be because the user is trying to require something
    // from a path loaded through a symlink (which is not possible, because we need something normalized to
    // figure out which package is making the require call), so we try to make the same request using a fully
    // resolved issuer and throws a better and more actionable error if it works.
    if (originalError.code === `BUILTIN_NODE_RESOLUTION_FAIL`) {
      let realIssuer;

      try {
        realIssuer = realpathSync(issuer);
      } catch (error) {}

      if (realIssuer) {
        if (issuer.endsWith(`/`)) {
          realIssuer = realIssuer.replace(/\/?$/, `/`);
        }

        try {
          exports.resolveToUnqualified(request, realIssuer, {extensions});
        } catch (error) {
          // If an error was thrown, the problem doesn't seem to come from a path not being normalized, so we
          // can just throw the original error which was legit.
          throw originalError;
        }

        // If we reach this stage, it means that resolveToUnqualified didn't fail when using the fully resolved
        // file path, which is very likely caused by a module being invoked through Node with a path not being
        // correctly normalized (ie you should use "node $(realpath script.js)" instead of "node script.js").
        throw makeError(
          `SYMLINKED_PATH_DETECTED`,
          `A pnp module ("${request}") has been required from what seems to be a symlinked path ("${issuer}"). This is not possible, you must ensure that your modules are invoked through their fully resolved path on the filesystem (in this case "${realIssuer}").`,
          {
            request,
            issuer,
            realIssuer,
          },
        );
      }
    }
    throw originalError;
  }

  if (unqualifiedPath === null) {
    return null;
  }

  try {
    return exports.resolveUnqualified(unqualifiedPath);
  } catch (resolutionError) {
    if (resolutionError.code === 'QUALIFIED_PATH_RESOLUTION_FAILED') {
      Object.assign(resolutionError.data, {request, issuer});
    }
    throw resolutionError;
  }
};

/**
 * Setups the hook into the Node environment.
 *
 * From this point on, any call to `require()` will go through the "resolveRequest" function, and the result will
 * be used as path of the file to load.
 */

exports.setup = function setup() {
  // A small note: we don't replace the cache here (and instead use the native one). This is an effort to not
  // break code similar to "delete require.cache[require.resolve(FOO)]", where FOO is a package located outside
  // of the Yarn dependency tree. In this case, we defer the load to the native loader. If we were to replace the
  // cache by our own, the native loader would populate its own cache, which wouldn't be exposed anymore, so the
  // delete call would be broken.

  const originalModuleLoad = Module._load;

  Module._load = function(request, parent, isMain) {
    if (!enableNativeHooks) {
      return originalModuleLoad.call(Module, request, parent, isMain);
    }

    // Builtins are managed by the regular Node loader

    if (builtinModules.has(request)) {
      try {
        enableNativeHooks = false;
        return originalModuleLoad.call(Module, request, parent, isMain);
      } finally {
        enableNativeHooks = true;
      }
    }

    // The 'pnpapi' name is reserved to return the PnP api currently in use by the program

    if (request === `pnpapi`) {
      return pnpModule.exports;
    }

    // Request `Module._resolveFilename` (ie. `resolveRequest`) to tell us which file we should load

    const modulePath = Module._resolveFilename(request, parent, isMain);

    // Check if the module has already been created for the given file

    const cacheEntry = Module._cache[modulePath];

    if (cacheEntry) {
      return cacheEntry.exports;
    }

    // Create a new module and store it into the cache

    const module = new Module(modulePath, parent);
    Module._cache[modulePath] = module;

    // The main module is exposed as global variable

    if (isMain) {
      process.mainModule = module;
      module.id = '.';
    }

    // Try to load the module, and remove it from the cache if it fails

    let hasThrown = true;

    try {
      module.load(modulePath);
      hasThrown = false;
    } finally {
      if (hasThrown) {
        delete Module._cache[modulePath];
      }
    }

    // Some modules might have to be patched for compatibility purposes

    if (patchedModules.has(request)) {
      module.exports = patchedModules.get(request)(module.exports);
    }

    return module.exports;
  };

  const originalModuleResolveFilename = Module._resolveFilename;

  Module._resolveFilename = function(request, parent, isMain, options) {
    if (!enableNativeHooks) {
      return originalModuleResolveFilename.call(Module, request, parent, isMain, options);
    }

    const issuerModule = getIssuerModule(parent);
    const issuer = issuerModule ? issuerModule.filename : process.cwd() + '/';

    const resolution = exports.resolveRequest(request, issuer);
    return resolution !== null ? resolution : request;
  };

  const originalFindPath = Module._findPath;

  Module._findPath = function(request, paths, isMain) {
    if (!enableNativeHooks) {
      return originalFindPath.call(Module, request, paths, isMain);
    }

    for (const path of paths) {
      let resolution;

      try {
        resolution = exports.resolveRequest(request, path);
      } catch (error) {
        continue;
      }

      if (resolution) {
        return resolution;
      }
    }

    return false;
  };

  process.versions.pnp = String(exports.VERSIONS.std);

  if (process.env.ESY__NODE_BIN_PATH != null) {
    const delimiter = require('path').delimiter;
    process.env.PATH = `${process.env.ESY__NODE_BIN_PATH}${delimiter}${process.env.PATH}`;
  }
};

exports.setupCompatibilityLayer = () => {
  // see https://github.com/browserify/resolve/blob/master/lib/caller.js
  const getCaller = () => {
    const origPrepareStackTrace = Error.prepareStackTrace;

    Error.prepareStackTrace = (_, stack) => stack;
    const stack = new Error().stack;
    Error.prepareStackTrace = origPrepareStackTrace;

    return stack[2].getFileName();
  };

  // ESLint currently doesn't have any portable way for shared configs to specify their own
  // plugins that should be used (https://github.com/eslint/eslint/issues/10125). This will
  // likely get fixed at some point, but it'll take time and in the meantime we'll just add
  // additional fallback entries for common shared configs.

  for (const name of [`react-scripts`]) {
    const packageInformationStore = packageInformationStores.get(name);
    if (packageInformationStore) {
      for (const reference of packageInformationStore.keys()) {
        fallbackLocators.push({name, reference});
      }
    }
  }

  // We need to shim the "resolve" module, because Liftoff uses it in order to find the location
  // of the module in the dependency tree. And Liftoff is used to power Gulp, which doesn't work
  // at all unless modulePath is set, which we cannot configure from any other way than through
  // the Liftoff pipeline (the key isn't whitelisted for env or cli options).

  patchedModules.set(/^resolve$/, realResolve => {
    const mustBeShimmed = caller => {
      const callerLocator = exports.findPackageLocator(caller);

      return callerLocator && callerLocator.name === 'liftoff';
    };

    const attachCallerToOptions = (caller, options) => {
      if (!options.basedir) {
        options.basedir = path.dirname(caller);
      }
    };

    const resolveSyncShim = (request, {basedir}) => {
      return exports.resolveRequest(request, basedir, {
        considerBuiltins: false,
      });
    };

    const resolveShim = (request, options, callback) => {
      setImmediate(() => {
        let error;
        let result;

        try {
          result = resolveSyncShim(request, options);
        } catch (thrown) {
          error = thrown;
        }

        callback(error, result);
      });
    };

    return Object.assign(
      (request, options, callback) => {
        if (typeof options === 'function') {
          callback = options;
          options = {};
        } else if (!options) {
          options = {};
        }

        const caller = getCaller();
        attachCallerToOptions(caller, options);

        if (mustBeShimmed(caller)) {
          return resolveShim(request, options, callback);
        } else {
          return realResolve.sync(request, options, callback);
        }
      },
      {
        sync: (request, options) => {
          if (!options) {
            options = {};
          }

          const caller = getCaller();
          attachCallerToOptions(caller, options);

          if (mustBeShimmed(caller)) {
            return resolveSyncShim(request, options);
          } else {
            return realResolve.sync(request, options);
          }
        },
        isCore: request => {
          return realResolve.isCore(request);
        },
      },
    );
  });
};

if (module.parent && module.parent.id === 'internal/preload') {
  exports.setupCompatibilityLayer();

  exports.setup();
}

if (process.mainModule === module) {
  exports.setupCompatibilityLayer();

  const reportError = (code, message, data) => {
    process.stdout.write(`${JSON.stringify([{code, message, data}, null])}\n`);
  };

  const reportSuccess = resolution => {
    process.stdout.write(`${JSON.stringify([null, resolution])}\n`);
  };

  const processResolution = (request, issuer) => {
    try {
      reportSuccess(exports.resolveRequest(request, issuer));
    } catch (error) {
      reportError(error.code, error.message, error.data);
    }
  };

  const processRequest = data => {
    try {
      const [request, issuer] = JSON.parse(data);
      processResolution(request, issuer);
    } catch (error) {
      reportError(`INVALID_JSON`, error.message, error.data);
    }
  };

  if (process.argv.length > 2) {
    if (process.argv.length !== 4) {
      process.stderr.write(`Usage: ${process.argv[0]} ${process.argv[1]} <request> <issuer>\n`);
      process.exitCode = 64; /* EX_USAGE */
    } else {
      processResolution(process.argv[2], process.argv[3]);
    }
  } else {
    let buffer = '';
    const decoder = new StringDecoder.StringDecoder();

    process.stdin.on('data', chunk => {
      buffer += decoder.write(chunk);

      do {
        const index = buffer.indexOf('\n');
        if (index === -1) {
          break;
        }

        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);

        processRequest(line);
      } while (true);
    });
  }
}
