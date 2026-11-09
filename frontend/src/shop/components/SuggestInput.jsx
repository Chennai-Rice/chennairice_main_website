import React, { useId, useState } from "react";

/**
 * A text box with a suggestion list under it (checkout address, Nov 2026). Typing filters; arrow keys move,
 * Enter or a tap picks, Escape closes. The customer can always ignore the list and type their own.
 * items: [{ key, label, sub }]; onPick(item) fills whatever fields the item carries.
 */
export default function SuggestInput({ value, onChange, items, onPick, inputProps }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const show = open && items.length > 0;

  const pick = (item) => {
    onPick(item);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (e) => {
    if (!show) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % items.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i <= 0 ? items.length - 1 : i - 1)); }
    else if (e.key === "Enter" && active >= 0) { e.preventDefault(); pick(items[active]); }
    else if (e.key === "Escape") { setOpen(false); }
  };

  return (
    <span className="suggest">
      <input
        {...inputProps}
        type="text"
        value={value}
        onChange={(e) => { onChange(e); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={show && active >= 0 ? `${listId}-${active}` : undefined}
      />
      {show && (
        <ul className="suggest-list" id={listId} role="listbox">
          {items.map((item, i) => (
            <li
              key={item.key}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`suggest-item${i === active ? " is-active" : ""}`}
              // mousedown, not click: picks before the box loses focus and closes the list.
              onMouseDown={(e) => { e.preventDefault(); pick(item); }}
            >
              <span className="suggest-label">{item.label}</span>
              {item.sub && <span className="suggest-sub">{item.sub}</span>}
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
