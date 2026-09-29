import React from "react";

export default function Footer() {
  return (
    <footer className="site-footer">
      <p>
        <strong>Chennai Rice Industries India (P) Ltd</strong>
      </p>
      {/* Matches the wording in content.js, privacyPolicy.js and
          termsConditions.js verbatim. This block used to be a fourth variant
          of the same address — "SF No:" with a colon, "4B" for "4-B", a
          "Chithode Via" line the others do not carry, and the PIN before the
          state. */}
      <address>
        SF No. 116/1,2,4-B, N.&nbsp;Thayirpalayam Village,
        <br />
        Nasiyanur, Gangapuram Post,
        <br />
        Erode, Tamil Nadu &ndash; 638102
      </address>
    </footer>
  );
}
