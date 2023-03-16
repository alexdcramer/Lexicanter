// TODO: The pronunciation rule format is going to be changed to the more standard `pattern/substitution/context` format. This whole function needs to be rewritten.
import { get } from 'svelte/store';
import { 
    Language, wordInput, pronunciations, phraseInput, phrasePronunciations 
} from '../stores.js';
import { applyRules, parseRules } from './sca';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { debug } from './diagnostics.js';
import type * as Lexc from '../types.js';
const Lang = () => get(Language);

/**
 * Takes a word and returns its pronunciation based on
 * the user-defined romanization rules.
 * @param {string} word
 * @returns {string}
 */
export function get_pronunciation(word: string, lect: string): string {
    // TODO: Rewrite most of this code for readability; it currently requires a lot of comments to understand.
    const romanizations = Lang().Pronunciations[lect];
    const settings = parseRules(romanizations);
    return applyRules(settings.rules, word, settings.categories);
}

/**
 * Rewrites all pronunciations for a given lect.
 */
export function writeRomans (lect: string) {
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
        Onsets: Lang().Phonotactics.General.Onsets.split(/\s+/g),
        Medials: Lang().Phonotactics.General.Medials.split(/\s+/g), 
        Codas: Lang().Phonotactics.General.Codas.split(/\s+/g),
        Vowels: Lang().Phonotactics.General.Vowels.split(/\s+/g),
        Illegals: Lang().Phonotactics.General.Illegals.split(/\s+/g)
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
            Onsets: Lang().Phonotactics.General.Onsets.split(/\s+/g),
            Medials: Lang().Phonotactics.General.Medials.split(/\s+/g),
            Codas: Lang().Phonotactics.General.Codas.split(/\s+/g),
            Vowels: Lang().Phonotactics.General.Vowels.split(/\s+/g),
            Illegals: Lang().Phonotactics.General.Illegals.split(/\s+/g)
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
