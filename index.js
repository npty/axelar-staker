const fs = require("fs");

const axelarLcdEndpoint = "https://lcd-axelar.imperator.co";
const axelarAllValidatorsEndpoint =
  axelarLcdEndpoint + "/cosmos/staking/v1beta1/validators";
const axelarDelegationsEndpoint = (delegatorAddress) =>
  axelarLcdEndpoint +
  `/cosmos/staking/v1beta1/validators/${delegatorAddress}/delegations`;

function parseDelegation(delegation) {
  const { delegation: innerDelegation, balance } = delegation;
  const amount = balance.amount;
  const staker = innerDelegation.delegator_address;

  return {
    staker: staker,
    amount: amount,
  };
}

function saveToFile(data) {
  fs.writeFileSync("delegations.json", JSON.stringify(data, null, 2));
}

async function getStakersByDelegatorAddresses(delegatorAddresses) {
  const allDelegations = [];
  let totalQueries = 0;

  for (const delegatorAddress of delegatorAddresses) {
    let nextKey = true;
    const queryParams = {};

    while (nextKey) {
      if (nextKey && typeof nextKey === "string") {
        queryParams["pagination.key"] = nextKey;
      }

      console.log(
        axelarDelegationsEndpoint(delegatorAddress) +
          new URLSearchParams(queryParams),
      );

      const delegationResponse = await fetch(
        axelarDelegationsEndpoint(delegatorAddress) +
          `?${new URLSearchParams(queryParams)}`,
      );

      const delegationResult = await delegationResponse.json();

      nextKey = delegationResult.pagination?.next_key;

      const delegations = delegationResult.delegation_responses;

      const parsedDelegations = delegations.map(parseDelegation);

      allDelegations.push(...parsedDelegations);
    }

    totalQueries++;

    console.log(
      `Fetched delegations ${totalQueries}/${delegatorAddresses.length}`,
    );
  }

  return allDelegations;
}

async function getDelegatorAddresses() {
  let nextKey = true;
  let allOperatorAddresses = [];

  while (nextKey) {
    // Exclude the validators that are not bonded
    const queryParams = {
      status: "BOND_STATUS_BONDED",
    };

    if (nextKey && typeof nextKey === "string") {
      queryParams["pagination.key"] = nextKey;
    }

    const response = await fetch(
      axelarAllValidatorsEndpoint + "?" + new URLSearchParams(queryParams),
    );

    const validatorResult = await response.json();

    nextKey = validatorResult.pagination.next_key;

    const operatorAddresses = validatorResult.validators.map(
      (validator) => validator.operator_address,
    );

    allOperatorAddresses.push(...operatorAddresses);
  }

  console.log("Total Operators: ", allOperatorAddresses.length);

  return allOperatorAddresses;
}

async function main() {
  const delegatorAddresses = await getDelegatorAddresses();
  const stakers = await getStakersByDelegatorAddresses(delegatorAddresses);

  saveToFile({
    snapshotAt: new Date().toISOString(),
    stakers: stakers,
    total: stakers.length,
  });
}

main();
