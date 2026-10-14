// Contents list for the legal pages: always open on wide screens, and the
// entry for the section being read is highlighted.
const toc = document.querySelector(".toc details");
const wide = window.matchMedia("(min-width: 960px)");
const syncOpen = () => {
  if (toc && wide.matches) toc.open = true;
};
syncOpen();
wide.addEventListener("change", syncOpen);

const links = [...document.querySelectorAll(".toc a")];
const sections = links
  .map((a) => document.getElementById(a.hash.slice(1)))
  .filter(Boolean);
const mark = (id) =>
  links.forEach((a) =>
    a.hash === "#" + id
      ? a.setAttribute("aria-current", "true")
      : a.removeAttribute("aria-current"),
  );
const watcher = new IntersectionObserver(
  (entries) => {
    const seen = entries.filter((e) => e.isIntersecting);
    if (seen.length) mark(seen[0].target.id);
  },
  { rootMargin: "-90px 0px -65% 0px" },
);
sections.forEach((s) => watcher.observe(s));

// On narrow screens, close the list after jumping to a section.
links.forEach((a) =>
  a.addEventListener("click", () => {
    if (toc && !wide.matches) toc.open = false;
  }),
);
