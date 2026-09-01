import { useState, useRef, useEffect } from "react";
import "./StaffSearchInput.css";

function StaffSearchInput({ value, options, onChange, onSelect, disabled, placeholder }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (options.length > 0 && String(value || "").trim().length > 0) {
      setOpen(true);
    } else {
      setOpen(false);
    }
  }, [options, value]);

  useEffect(() => {
    const closeOnOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("touchstart", closeOnOutside);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("touchstart", closeOnOutside);
    };
  }, []);

  const handleSelect = (e, staff) => {
    e.preventDefault();
    onSelect(staff);
    setOpen(false);
  };

  return (
    <div className="staff-search" ref={containerRef}>
      <input
        type="text"
        className="staff-search__input"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          if (options.length > 0 && String(value || "").trim()) setOpen(true);
        }}
      />
      {open && !disabled && options.length > 0 && (
        <ul className="staff-search__dropdown" role="listbox">
          {options.map((staff) => (
            <li
              key={staff._id}
              role="option"
              className="staff-search__option"
              onMouseDown={(e) => handleSelect(e, staff)}
              onTouchEnd={(e) => handleSelect(e, staff)}
            >
              <span className="staff-search__no">{staff.employeeNo}</span>
              <span className="staff-search__name">{staff.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default StaffSearchInput;
