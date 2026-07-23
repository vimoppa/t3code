{
  pkgs,
  src,
  rev,
  shortRev,
}:

let
  inherit (pkgs) lib;
  sourceVersion = (builtins.fromJSON (builtins.readFile "${src}/apps/desktop/package.json")).version;
  appSource = lib.cleanSourceWith {
    inherit src;
    filter =
      path: _type:
      let
        relativePath = lib.removePrefix "${toString src}/" (toString path);
      in
      relativePath != "flake.lock" && relativePath != "flake.nix" && !lib.hasPrefix "nix/" relativePath;
  };
  pnpm = pkgs.pnpm_11.overrideAttrs (_: {
    version = "11.10.0";
    src = pkgs.fetchurl {
      url = "https://registry.npmjs.org/pnpm/-/pnpm-11.10.0.tgz";
      hash = "sha256-YgtmBepPYvxWptCphzP0eQcdAyHgPkhrUix+mnRhdDE=";
    };
  });
  unwrapped = (pkgs.t3code.unwrapped.override { pnpm_10 = pnpm; }).overrideAttrs (
    finalAttrs: previousAttrs: {
      src = appSource;
      version = "${sourceVersion}-main.${shortRev}";

      pnpmDeps = pkgs.fetchPnpmDeps {
        inherit pnpm;
        inherit (finalAttrs)
          pname
          src
          pnpmWorkspaces
          ;
        version = sourceVersion;
        fetcherVersion = 4;
        pnpmInstallFlags = [
          "--fetch-retries=5"
          "--fetch-timeout=300000"
          "--network-concurrency=4"
        ];
        hash = "sha256-bfZDQjVdT0neQYxmNB8t+XU8mbjVsAtaTi2Vms5pzxw=";
      };

      preBuild = ''
        node scripts/update-release-package-versions.ts ${sourceVersion}

        export npm_config_nodedir=${pkgs.nodejs}
        export ELECTRON_SKIP_BINARY_DOWNLOAD=1
        pnpm rebuild --pending "''${pnpmInstallFlags[@]}" --filter '!@t3tools/monorepo'
      '';

      passthru = { };

      meta = previousAttrs.meta // {
        homepage = "https://github.com/vimoppa/t3code";
        changelog = "https://github.com/vimoppa/t3code/commit/${rev}";
        maintainers = [ ];
      };
    }
  );
in
pkgs.t3code.override {
  t3code-unwrapped = unwrapped;
  symlinkJoin =
    args:
    pkgs.symlinkJoin (
      args
      // {
        postBuild =
          (args.postBuild or "")
          + lib.optionalString pkgs.stdenv.hostPlatform.isDarwin ''
            wrapProgram "$out/bin/t3code-desktop" \
              --set T3CODE_COMMIT_HASH ${lib.escapeShellArg rev} \
              --set T3CODE_DISABLE_AUTO_UPDATE 1

            app="$out/Applications/T3 Code (Alpha).app"
            appCopy="$NIX_BUILD_TOP/t3code.app"
            cp --recursive --dereference --no-preserve=mode "$app" "$appCopy"
            rm --recursive "$app"
            mv "$appCopy" "$app"

            substituteInPlace "$app/Contents/Info.plist" \
              --replace-fail \
                '<string>org.nixos.T3 Code (Alpha)</string>' \
                '<string>com.t3tools.t3code</string>'

            /usr/bin/codesign --force --deep --sign - "$app"
          '';
      }
    );
}
