import { readJson, writeJson } from "./cache.js";

const JOB_CARDS_KEY = "ksc_job_cards";

export const getJobCards = () => {
  return readJson(JOB_CARDS_KEY, []);
};

export const saveJobCards = (jobCards) => {
  writeJson(JOB_CARDS_KEY, jobCards);
};
