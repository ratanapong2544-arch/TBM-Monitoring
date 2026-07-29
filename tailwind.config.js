module.exports = {
  content: ["./public/index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT:"#003B84", dark:"#0C2C65", deepest:"#00246C", pressed:"#001A57" },
        cyan: { DEFAULT:"#38A7CE", med:"#1E80BD", tint:"#E5F1FF", vtint:"#F5FAFF" },
        sgreen: { dark:"#10463A", med:"#44C473" },
        code: { a:"#10463A", b:"#B8860B", c:"#C8500A", d:"#B91C1C" },
        ink: { DEFAULT:"#333333", 2:"#666666", 3:"#999999" },
        surface: { DEFAULT:"#FFFFFF", page:"#F8FAFD", alt:"#F5FAFF" },
        line: { DEFAULT:"#E8E8E8", input:"#D8D8D8", divider:"#F0F0F0" },
      },
      borderRadius: { badge:"4px", input:"6px", button:"6px", card:"8px", modal:"12px" },
      boxShadow: {
        card:"0 1px 2px rgba(0,59,132,0.04)",
        hover:"0 2px 8px rgba(0,59,132,0.06)",
        modal:"0 12px 32px rgba(12,44,101,0.18)",
      },
      fontFamily: {
        sans:['"IBM Plex Sans Thai"','"IBM Plex Sans"',"sans-serif"],
        mono:['"IBM Plex Mono"',"Consolas","monospace"],
      },
    },
  },
  plugins: [],
};
