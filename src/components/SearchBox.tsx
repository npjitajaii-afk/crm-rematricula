import React from "react";
import { Search, X } from "lucide-react";
import "./SearchBox.css";

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Largura máxima opcional (ex: Meus Contatos). */
  maxWidth?: string | number;
  className?: string;
  id?: string;
}

/**
 * Barra de busca padrão do CRM com botão "x" para limpar o texto.
 */
const SearchBox: React.FC<SearchBoxProps> = ({
  value,
  onChange,
  placeholder = "Buscar...",
  maxWidth,
  className = "",
  id,
}) => {
  return (
    <div
      className={`search-box ${className}`.trim()}
      style={maxWidth != null ? { maxWidth } : undefined}
    >
      <Search size={20} aria-hidden />
      <input
        id={id}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
      {value.trim().length > 0 && (
        <button
          type="button"
          className="search-box-clear"
          onClick={() => onChange("")}
          aria-label="Limpar busca"
          title="Limpar busca"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
};

export default SearchBox;
