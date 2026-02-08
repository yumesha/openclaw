{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = with pkgs; [
    nodejs_22
    pnpm
    bun
    typescript
    nixfmt-rfc-style
  ];

  shellHook = ''
    export PATH="$PWD/node_modules/.bin:$PATH"

    # Auto-install if node_modules missing
    if [ ! -d "node_modules" ]; then
      echo "Installing dependencies..."
      pnpm install
    fi
  '';
}
