export const THEME_STORAGE_KEY = "mcv-theme";

export type ThemeName = "light" | "dark";

/**
 * Runs before the browser paints so a dark-mode visitor never sees a white
 * flash. An explicit choice always wins; the system preference is consulted
 * only when the visitor has never used the switch.
 */
export const THEME_PREPAINT_SCRIPT = `(function(){
try{
var k="${THEME_STORAGE_KEY}";
var s=localStorage.getItem(k);
var dark=s==="dark"||(s!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);
var c=document.documentElement;
c.classList.toggle("dark",dark);
c.setAttribute("data-theme",dark?"dark":"light");
c.style.colorScheme=dark?"dark":"light";
}catch(e){}
})();`;
