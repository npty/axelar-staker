const fs = require("fs");

const CONFIG = {
  axelarLcdEndpoint: "https://lcd-axelar.imperator.co",
  retryAttempts: 3,
  retryDelay: 1000, // 1 second
  outputFile: "delegations.json",
};

const API = {
  validators: `${CONFIG.axelarLcdEndpoint}/cosmos/staking/v1beta1/validators`,
  delegations: (delegatorAddress) =>
    `${CONFIG.axelarLcdEndpoint}/cosmos/staking/v1beta1/validators/${delegatorAddress}/delegations`,
};

async function fetchWithRetry(url, attempts = CONFIG.retryAttempts) {
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    if (attempts <= 1) throw error;

    console.warn(
      `Retrying fetch for ${url}. Attempts remaining: ${attempts - 1}`,
    );
    await new Promise((resolve) => setTimeout(resolve, CONFIG.retryDelay));
    return fetchWithRetry(url, attempts - 1);
  }
}

function parseDelegation(delegation) {
  const { delegation: innerDelegation, balance } = delegation;
  return {
    staker: innerDelegation.delegator_address,
    amount: balance.amount,
  };
}

function saveToFile(data) {
  try {
    fs.writeFileSync(CONFIG.outputFile, JSON.stringify(data, null, 2));
    console.log(`Data successfully saved to ${CONFIG.outputFile}`);
  } catch (error) {
    console.error("Failed to save data to file:", error.message);
    throw error;
  }
}

async function getStakersByDelegatorAddresses(delegatorAddresses) {
  const allDelegations = [];

  for (const [index, delegatorAddress] of delegatorAddresses.entries()) {
    let nextKey = null;

    do {
      const queryParams = new URLSearchParams({
        ...(nextKey && { "pagination.key": nextKey }),
      });

      const delegationResult = await fetchWithRetry(
        `${API.delegations(delegatorAddress)}?${queryParams}`,
      );

      const parsedDelegations =
        delegationResult.delegation_responses.map(parseDelegation);

      allDelegations.push(...parsedDelegations);

      nextKey = delegationResult.pagination?.next_key;
      console.log(
        `Progress: ${index + 1}/${delegatorAddresses.length} delegator addresses processed`,
      );
    } while (nextKey);
  }

  return allDelegations;
}

async function getDelegatorAddresses() {
  const allOperatorAddresses = [];
  let nextKey = null;

  do {
    const queryParams = new URLSearchParams({
      status: "BOND_STATUS_BONDED",
      ...(nextKey && { "pagination.key": nextKey }),
    });

    const validatorResult = await fetchWithRetry(
      `${API.validators}?${queryParams}`,
    );

    const operatorAddresses = validatorResult.validators.map(
      (validator) => validator.operator_address,
    );

    allOperatorAddresses.push(...operatorAddresses);
    nextKey = validatorResult.pagination.next_key;
  } while (nextKey);

  console.log("Total Operators:", allOperatorAddresses.length);
  return allOperatorAddresses;
}

async function main() {
  try {
    console.log("Starting delegation snapshot process...");

    const delegatorAddresses = await getDelegatorAddresses();
    const stakers = await getStakersByDelegatorAddresses(delegatorAddresses);

    const result = {
      snapshotAt: new Date().toISOString(),
      stakers,
      total: stakers.length,
    };

    saveToFile(result);
    console.log("Snapshot process completed successfully!");
  } catch (error) {
    console.error("Failed to complete snapshot process:", error.message);
    process.exit(1);
  }
}

main();
