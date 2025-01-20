-- It's three superficially unrelated plugins in one that share a common theme: working with variants of a word.
-- Abbreviations: define many at once
--   :Abolish {despa,sepe}rat{e,es,ed,ing,ely,ion,ions,or}  {despe,sepa}rat{}
-- Substitution: like abbreviations, but only once
--   :%Subvert/facilit{y,ies}/building{,s}/g
-- Coercion: change fooBar into foo_bar
do
  return {}
end

return {
  "tpope/vim-abolish",
  version = "*",
}
