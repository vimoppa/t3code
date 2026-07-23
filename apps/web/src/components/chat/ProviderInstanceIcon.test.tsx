import { ProviderDriverKind } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ProviderInstanceIcon } from "./ProviderInstanceIcon";

describe("ProviderInstanceIcon", () => {
  it("renders the GitHub Copilot logo instead of provider initials", () => {
    const markup = renderToStaticMarkup(
      <ProviderInstanceIcon
        driverKind={ProviderDriverKind.make("copilot")}
        displayName="GitHub Copilot"
      />,
    );

    expect(markup).toContain("<svg");
    expect(markup).not.toContain(">GC<");
  });
});
