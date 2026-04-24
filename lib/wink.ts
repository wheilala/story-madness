import winkNLP from "wink-nlp";
import model from "wink-eng-lite-web-model";

const nlp = winkNLP(model);

export const wink = {
  nlp,
  its: nlp.its
};

export type WinkDoc = ReturnType<typeof nlp.readDoc>;

export function readDoc(text: string): WinkDoc {
  return nlp.readDoc(text);
}
