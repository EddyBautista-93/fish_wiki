const express = require("express");
const axios = require("axios");
const redis = require("redis");

const app = express();
const port = process.env.PORT || 3000;

let redisClient;

// anonymous self-invoked async function invoking the
// createClient method. 
// By default Redis uses port 6379.
(async () => {
  redisClient = redis.createClient();

  redisClient.on("error", (error) => console.error(`Error : ${error}`));

  await redisClient.connect();
})();

// function that grabs the data from fishwatch API.
async function fetchApiData(species) {
  const apiResponse = await axios.get(
    `https://www.fishwatch.gov/api/species/${species}`
  );
  console.log("Request sent to the API");
  return apiResponse.data;
}

// middleware cache function
async function cacheData(req,res,next) {
    const species = req.params.species;
    let results;
    try {
        const cacheResults = await redisClient.get(species);
        if(cacheResults){
            results = JSON.parse(cacheResults);
            res.send({
                fromCache: true,
                data:results,
            });
        }else {
            // executes the following function.
            next();
        }
    } catch (error) {
        console.error(error);
        res.status(404);
    }
}

async function getSpeciesData(req, res) {
  const species = req.params.species;
  let results;

  // if the data is inside of the redis cached store we change isCached
  // to true and return the data from there instead of calling the fetchApi Data function
  try {
      results = await fetchApiData(species);
      if (results.length === 0) {
        throw "API returned an empty array";
      }
      // save store the data in Redis Cache
      // EX: Accepts a value with the Cache Duration
      // NX: ensures that the set method only sets a key that doesn't exist in Redis store when true.
      await redisClient.set(species, JSON.stringify(results),{
        EX:180,
        NX:true,
      });
    // return the results from the get method
    res.send({
      fromCache: false,
      data: results,
    });
  } catch (error) {
    console.error(error);
    res.status(404).send("Data unavailable");
  }
}



// API endpoint
app.get("/fish/:species", cacheData, getSpeciesData);

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
