{
  description = "T3 Code desktop application";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "aarch64-darwin"
        "aarch64-linux"
        "x86_64-linux"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      packages = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
          t3code = pkgs.callPackage ./nix/package.nix {
            src = self;
            rev = self.rev or self.dirtyRev or "dirty";
            shortRev = self.shortRev or self.dirtyShortRev or "dirty";
          };
        in
        {
          inherit t3code;
          default = t3code;
        }
      );

      checks = forAllSystems (system: {
        package = self.packages.${system}.t3code;
      });
    };
}
