import React, { useState, useRef, useEffect } from "react";
import { Input } from "./input";
import { Button } from "./button";
import { X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  onAddSuggestion: (suggestion: string) => void;
  onRemoveSuggestion: (suggestion: string) => void;
  placeholder?: string;
  id?: string;
  className?: string;
}

export const AutocompleteInput: React.FC<AutocompleteInputProps> = ({
  value,
  onChange,
  suggestions,
  onAddSuggestion,
  onRemoveSuggestion,
  placeholder = "Type to search or add new...",
  id,
  className,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const [newSuggestion, setNewSuggestion] = useState("");
  const [showAddSection, setShowAddSection] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Filter suggestions based on input value
    if (value) {
      const filtered = suggestions.filter((suggestion) =>
        suggestion.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredSuggestions(filtered);
    } else {
      setFilteredSuggestions(suggestions);
    }
  }, [value, suggestions]);

  useEffect(() => {
    // Close dropdown when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    setIsOpen(true);
  };

  const handleSuggestionClick = (suggestion: string) => {
    onChange(suggestion);
    setIsOpen(false);
  };

  const handleAddNewSuggestion = () => {
    if (newSuggestion.trim() && !suggestions.includes(newSuggestion.trim())) {
      onAddSuggestion(newSuggestion.trim());
      setNewSuggestion("");
      setShowAddSection(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        id={id}
        value={value}
        onChange={handleInputChange}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-[300px] overflow-y-auto">
          {filteredSuggestions.length > 0 ? (
            <div className="py-1">
              {filteredSuggestions.map((suggestion, index) => (
                <div
                  key={index}
                  className="px-3 py-2 cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors"
                  onClick={() => handleSuggestionClick(suggestion)}
                >
                  {suggestion}
                </div>
              ))}
            </div>
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No suggestions found
            </div>
          )}

          <div className="border-t border-border p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-primary"
              onClick={() => setShowAddSection(!showAddSection)}
            >
              <Plus className="h-4 w-4 mr-2" />
              {showAddSection ? "Cancel" : "Add New Item Name"}
            </Button>

            {showAddSection && (
              <div className="mt-2 space-y-2">
                <Input
                  value={newSuggestion}
                  onChange={(e) => setNewSuggestion(e.target.value)}
                  placeholder="Enter new item name"
                  onKeyPress={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddNewSuggestion();
                    }
                  }}
                />
                <Button
                  size="sm"
                  onClick={handleAddNewSuggestion}
                  className="w-full"
                  disabled={!newSuggestion.trim()}
                >
                  Add to Suggestions
                </Button>
              </div>
            )}
          </div>

          {/* Manage Suggestions Section */}
          {suggestions.length > 0 && (
            <div className="border-t border-border p-2 max-h-[150px] overflow-y-auto">
              <p className="text-xs text-muted-foreground mb-2 font-medium">
                Manage Saved Names
              </p>
              <div className="space-y-1">
                {suggestions.map((suggestion, index) => (
                  <div
                    key={index}
                    className={cn(
                      "flex items-center justify-between px-2 py-1 rounded text-sm group",
                      "hover:bg-muted transition-colors"
                    )}
                  >
                    <span className="flex-1 truncate">{suggestion}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveSuggestion(suggestion);
                      }}
                    >
                      <X className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
