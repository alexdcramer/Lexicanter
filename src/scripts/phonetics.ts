// TODO: The pronunciation rule format is going to be changed to the more standard `pattern/substitution/context` format. This whole function needs to be rewritten.
import { get } from 'svelte/store';
import { 
    Language, pronunciationRules, wordInput, pronunciations, phraseInput, phrasePronunciations 
} from '../stores.js';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { debug } from '../scripts/diagnostics';
import type * as Lexc from './types';
const Lang = () => get(Language);

/**
 * Takes a word and returns its pronunciation based on
 * the user-defined romanization rules.
 * @param {string} word
 * @returns {string}
 */
export function get_pronunciation(word: string, lect: string): string {
    // TODO: Rewrite most of this code for readability; it currently requires a lot of comments to understand.
    const $romanizations = get(pronunciationRules)[lect];
    const caseSensitive = Lang().CaseSensitive;
    word = `^${word.replaceAll(/[^\S\n]|(\n)/gm, '^$1')}^`; // add carets for front/end searching, treat spaces as word boundaries
    word = caseSensitive? word : word.toLowerCase(); // if the case-sensitive setting is ticked, don't force to lowercase.
    // Romanizations need to be sorted by length and applied in that order.
    // First, we need an array of all the differnt lengths of polygraphs which are used in the romanizations.
    let lengths: number[] = [];
    for (const rom in $romanizations) {
        lengths.push(rom.length);
    }
    lengths = Array.from(new Set(lengths)).sort((a, b) => b - a); // descending order, unique. It just works.

    // We then create a dictionary with all of these lengths as keys.
    // For each length key, its value is set to a dictionary of romanizations, such that `sort` is formatted like
    // {
    //  1: { '1 character pattern': 'pronunciation', 'another 1 character pattern': 'pronunciation', ... },
    //  2: { '2 character pattern': 'pronunciation', ... }
    //  ...
    // }
    
    const sort: { [index: number]: { [index: string]: string; } } = {};
    for (const length of lengths) {
        if (!(length in sort)) {
            sort[length] = {};
        }
        for (const rom in $romanizations) {
            if (rom.length === length) {
                sort[length][rom] = $romanizations[rom];
            }
        }
    }

    /** 
     * Then we go through each length of pattern, checking for patterns from the starting point of each
     * character in the word. Given the word 'dread' and the pattern 'ad', it would find a pattern match
     * when i = 3 and the patterns length we're checking for is 2 (†1). We then find the pronunciation to
     * substitute at this position (†2) and use slices to replace the pattern with the substitute (†3).
     * We add the length of the substituion string to `i` so that the next iteration skips past the part of
     * the word we have already changed (†4). When this process is done, we remove the carets (†5) and
     * return the processed word. 
     */
    for (let i = 0; i < word.length; i++) {
        for (const length of lengths) {
            const substring: string = word.slice(i, i + length);

            let match: boolean | string = false;
            Object.keys(sort[length]).forEach(pattern => {
                const new_pattern = [...pattern]
                    .map((char, i) => {
                        return char === '_' && substring[i] !== '^'? substring[i] : char;
                    })
                    .join('');
                if (new_pattern === substring) {
                    match = [...sort[length][pattern]]
                        .map((char, i) => {
                            return char === '_' && substring[i] !== '^'? substring[i] : char;
                        })
                        .join('');
                }
            });

            if (substring in sort[length] || match) { // †1
                const substitute = match ? match : sort[length][substring]; // †2
                word = word.slice(0, i) + substitute + word.slice(length + i); // †3
                i += substitute.length - 1; // †4
                break;
            }
        }
    }
    return word.replaceAll('^', ' ').trim().replaceAll('∅', ''); // (†5)
}

/**
 * Takes a list of rules and a dictionary of categories and returns a new list of rules
 * which have been permutated with every item from the categories for every rule that
 * contains a category symbol.
 * @param {Array} rules
 * @param {Object} categories
 * @returns {Array} The expanded rules array.
 */ //TODO: Like most of the arrays and dictionaries in this codebase, new interfaces should be created (TS migration).
function generateRules(rules: string[], categories) {
    // This function was mostly generated by OpenAI's chatGPT @ https://chat.openai.com/chat.

    // Initialize an empty array to store the expanded rules
    const expandedRules = [];

    // Iterate through each rule
    for (const rule of rules) {
        // Split the rule into pattern and substitution parts
        const [pattern, substitution] = rule.split('>');

        // Split the pattern and substitution into arrays of characters
        const patternArray = pattern.split('');
        const substitutionArray = substitution.split('');

        // Create a new set of unique category symbols in the pattern
        const uniqueCategorySymbols = [
            ...new Set<string>(patternArray.filter((symbol: string) => symbol in categories)),
        ];

        // Create all possible combinations of the unique category symbols.
        const combinations = uniqueCategorySymbols.reduce(
            (combos, symbol) => {
                const newCombos = [];
                for (const combo of combos) {
                    for (const item of categories[symbol]) {
                        newCombos.push(combo.concat(item));
                    }
                }
                return newCombos;
            },
            [[]]
        );

        // Iterate through the combinations of symbols
        for (const combo of combinations) {
            let newPattern = [...patternArray];
            let expandedSubstitution = [...substitutionArray];

            // Replace the category symbols in the pattern and substitution with the corresponding symbol in the combination
            for (let i = 0; i < uniqueCategorySymbols.length; i++) {
                newPattern = newPattern.map(symbol =>
                    symbol === uniqueCategorySymbols[i] ? combo[i] : symbol
                );
            }

            // GPT couldn't figure out how to do this block. Have to do this myself. If there are bugs, they're probably here.
            expandedSubstitution = expandedSubstitution.map((symbol, index) => {
                if (uniqueCategorySymbols.includes(symbol)) {
                    // symbol is in pattern
                    return combo[uniqueCategorySymbols.indexOf(symbol)];
                } else if (symbol in categories) {
                    // symbol is not in pattern
                    return categories[symbol][
                        categories[[...patternArray][index]].indexOf(
                            newPattern[index]
                        )
                    ];
                } else {
                    return symbol;
                } // symbol is not a category
            });

            // generate the new rule by joining pattern and substitution and push into expandedRules
            const expandedRule = `${newPattern.join('')}>${expandedSubstitution.join('')}`;
            // expandedRule = expandedRule.replaceAll('∅', ''); // get rid of null signs // leave null signs, post-processor takes care of it
            expandedRules.push(expandedRule);
        }
    }
    // Return the expanded rules array
    return expandedRules;
}

/**
 * Updates the romanizations object with the new rules. Uses {@link generateRules}
 * to deal with category symbol parsing. It updates the pronunciations of all
 * entries in the lexicon and phrasebook, provided they are not marked as
 * irregular.
 */
export function writeRomans (lect: string) {
    const $romanizations = {};
    const categories = {};
    const rules = [];

    // On a first pass of the input directly in the textarea,
    // we parse out the category definitions and rom rules.
    const txt: string = Lang().Pronunciations[lect];
    txt.split('\n').forEach(line => {
        // Parse each new line as a rule
        // remove all white space
        const rule = line.trim().replace(/\s+/g, '');
        // if the rule contain `::`, it is a category
        if (rule.includes('::')) {
            const [symbol, items_string] = rule.split('::');
            const items = items_string.split(',');
            categories[symbol] = items;
        }
        // if the rule contain `>`, it is a rom rule
        if (rule.includes('>')) {
            rules.push(rule);
        }
    });

    // Then we let GPT solve all my problems.
    const full_rule_set = generateRules(rules, categories);

    // And now we just have to parse the rules to the romanizations dict.
    full_rule_set.forEach(rule => {
        const [pattern, substituion] = rule.split('>');
        $romanizations[pattern] = substituion;
    });

    // The block below is used to update all the pronunciation values in the editors, lexicon, and phrasebook.
    get(pronunciations)[lect] = get_pronunciation(get(wordInput), lect);

    const lexicon: Lexc.Lexicon = Lang().Lexicon;
    for (const word in lexicon) {
        if (lexicon[word].pronunciations.hasOwnProperty(lect)) {
            if (lexicon[word].pronunciations[lect].irregular === false) {
                // all non-irrelgular pronunciations
                lexicon[word].pronunciations[lect].ipa = get_pronunciation(word, lect);
            }
        }
    }
    Lang().Lexicon = lexicon;

    // TODO: Phrasebook dialects
    get(phrasePronunciations)[lect] = get_pronunciation(get(phraseInput), 'General');
    const phrasebook: Lexc.Phrasebook = Lang().Phrasebook;
    for (const category in phrasebook) {
        for (const entry in phrasebook[category]) {
            // TODO: Check pronunciations of all dialects
            phrasebook[category][entry].pronunciations.General.ipa =
                get_pronunciation(entry, 'General');
            for (const variant in phrasebook[category][entry].variants) {
                phrasebook[category][entry].variants[variant].pronunciations.General.ipa =
                    get_pronunciation(variant, 'General');
            }
        }
    }
    Lang().Phrasebook = phrasebook;
    get(pronunciationRules)[lect] = $romanizations;
}

/**
 * Attempts to complete a given word using the user's phonotactics.
 * @param {string} trial
 * @returns {string} The completed word, or an empty string if no word could be generated
 */
export function complete_word(trial) {
    const random_boolean = () => Math.floor(Math.random() * 2) === 0;
    const choice = arr => arr[Math.floor(Math.random() * arr.length)];
    const inventory = {
        Onsets: Lang().Phonotactics.General.Onsets,
        Medials: Lang().Phonotactics.General.Medials, 
        Codas: Lang().Phonotactics.General.Codas,
        Vowels: Lang().Phonotactics.General.Vowels,
        Illegals: Lang().Phonotactics.General.Illegals? Lang().Phonotactics.General.Illegals : []
    };
    let word = '^' + trial;

    const finalize = (word: string) => {
        word += '^';
        if (!inventory.Illegals.some(v => word.includes(v))) {
            return word.replace(/\^/g, '');
        } else {
            return '';
        }
    };

    let ends_in_vowel = false;
    for (const v of inventory.Vowels) {
        // Check if word ends in vowel; add middle consonant and vowel, or coda and end
        if (
            word.includes(v) &&
            word.lastIndexOf(v) === word.length - v.length
        ) {
            if (random_boolean()) {
                word += choice(inventory.Medials) + choice(inventory.Vowels);
                ends_in_vowel = true;
                break;
            } else {
                word += choice(inventory.Codas);
                return finalize(word);
            }
        }
    }
    if (!ends_in_vowel) {
        // Add vowel to end of word, potentially end word with vowel or vowel + coda
        word += choice(inventory.Vowels);
        if (random_boolean()) {
            if (random_boolean()) {
                word += choice(inventory.Codas);
            }
            return finalize(word);
        }
    }
    // End word with one of: coda, middle + vowel, or middle + vowel + coda
    if (random_boolean()) {
        word += choice(inventory.Codas);
    } else {
        word += choice(inventory.Medials) + choice(inventory.Vowels);
        if (random_boolean()) {
            word += choice(inventory.Codas);
        }
    }
    return finalize(word);
}

/**
 * Generates a random word based on the given phonotactics. Will attempt
 * up to 50 times to generate a word that does not contain any illegal
 * combinations. If no word can be generated, returns an empty string.
 * @returns {string} The generated word, or an empty string if one could not be generated.
 */
export function generate_word() {
    const attempt = () => {
        const inventory = {
            Onsets: Lang().Phonotactics.General.Onsets,
            Medials: Lang().Phonotactics.General.Medials,
            Codas: Lang().Phonotactics.General.Codas,
            Vowels: Lang().Phonotactics.General.Vowels,
            Illegals: Lang().Phonotactics.General.Illegals? Lang().Phonotactics.General.Illegals : []
        };
        const random_boolean = () => Math.floor(Math.random() * 2) === 0;
        const choice = arr => arr[Math.floor(Math.random() * arr.length)];
        let word = '^';
    
        if (random_boolean()) {
            word += choice(inventory.Vowels);
        } else {
            word += choice(inventory.Onsets);
            word += choice(inventory.Vowels);
        }
    
        for (let j = 0; j < 2; j++) {
            if (random_boolean() || word.length === 2 /* word is "^vowel" */) {
                word += choice(inventory.Medials);
                word += choice(inventory.Vowels);
            }
        }
        if (random_boolean()) {
            word += choice(inventory.Codas);
        }
    
        word += '^';
        if (!inventory.Illegals.some(v => word.includes(v))) {
            return word.replace(/\^/g, '');
        } else {
            return '';
        }
    };
    for (let i = 0; i < 50; i++) {
        const word = attempt();
        if (!!word) {
            return word;
        }
    }
    return '';
}
