const SEGMENTS = {
  "0": "abcdef",
  "1": "bc",
  "2": "abdeg",
  "3": "abcdg",
  "4": "bcfg",
  "5": "acdfg",
  "6": "acdefg",
  "7": "abc",
  "8": "abcdefg",
  "9": "abcdfg",
  "-": "g",
};

export function createSeven(root, pattern) {
  root.textContent = "";
  const digits = [];

  for (const char of pattern) {
    const cell = document.createElement("span");
    if (char === ":") {
      cell.className = "colon";
      cell.append(document.createElement("i"), document.createElement("i"));
    } else {
      cell.className = "digit";
      for (const segment of "abcdefg") {
        const bar = document.createElement("i");
        bar.className = "s" + segment;
        cell.append(bar);
      }
      digits.push(cell);
    }
    root.append(cell);
  }

  function set(value) {
    const chars = String(value).replace(/[^0-9-]/g, "");
    digits.forEach((cell, index) => {
      const lit = SEGMENTS[chars[index]] || "";
      for (const bar of cell.children) {
        bar.classList.toggle("on", lit.includes(bar.className.slice(1)));
      }
    });
  }

  set("0".repeat(digits.length));
  return { set };
}
