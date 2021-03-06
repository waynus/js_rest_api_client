'use strict';

/**
 * Copyright 2000-2014 NeuStar, Inc. All rights reserved.
 * NeuStar, the Neustar logo and related names and logos are registered
 * trademarks, service marks or tradenames of NeuStar, Inc. All other
 * product names, company names, marks, logos and symbols may be trademarks
 * of their respective owners.
 */


function Ctrl($scope, $http, $parse, $resource) {
    // default values
    $scope.apiurl = 'http://localhost:8080/v1';
    $scope.username = '';
    $scope.password = '';

    // Helper function to assign default initial values
    $scope.assign = function(variable, value) {
      var getter = $parse(variable);
      var setter = getter.assign;
      setter($scope, value);
    }

    // The need for this method is to account for any changes in the apiurl entered by the user
    // If there is no need to read the apiUrl as a User Input (i.e it is a constant), then the resource can be prepared
    // once during page load and kept as a var
    $scope.prepareResource = function(endpoint) {
    var res = $resource($scope.apiurl + endpoint,null,
        {
          'update': { method:'PUT' }
        });
    return res;
    }

    function setAuthHeader() {
      $http.defaults.headers.common["Authorization"] = "Bearer " + $scope.authResponse.accessToken;
    }


    function prepareAuthResource() {
        var res = $resource($scope.apiurl + '/authorization/token',null,
            {
              'save': { method:'POST',
                        headers: {'Content-Type': 'application/x-www-form-urlencoded'} }
            });
        return res;
    }

    $scope.authorize = function() {
        var res = prepareAuthResource();
        res.save(null, "grant_type=password&username=" + $scope.username + "&password=" + $scope.password,
          function(data, status, headers, config) {
              $scope.generalResponse = data;
              $scope.authResponse = data;
          },
          function(error) {
              $scope.authResponse = '';
              $scope.generalResponse = error.data;
          });
    };

    $scope.authorizeWithRefreshToken = function(callback) {
      var res = prepareAuthResource();
      res.save(null, 'grant_type=refresh_token&refresh_token=' + $scope.authResponse.refreshToken,
          function(data, status, headers, config) {
              $scope.generalResponse = data;
              $scope.authResponse = data;
              if(callback != null) {
                  callback();
              }
          },
          function(error) {
              $scope.authResponse = '';
              $scope.generalResponse = error.data;
          }
      );
    };



    $scope.onSuccess = function(data, status, headers, config) {
      $scope.generalResponse = data;
    }

    function handleError(error, doNotReattempt, callback)  {
      $scope.generalResponse = error.data;
      var errorCode = error.data.errorCode;
      if(errorCode == '60001' && !doNotReattempt) {
          // specifying callback to be called on success of refresh token retrieval
          // the callback will attempt to make another request with new token values
          $scope.authorizeWithRefreshToken(callback);
      }
    }

    $scope.onError = function(res, params, requestJson, doNotReattempt, functionToRetry) {
      return function(error) {
          handleError(error, doNotReattempt, function() {
              functionToRetry(res,params, requestJson, true);
          });
      }
    }

    $scope.getRequest = function(res, params, doNotReattempt) {
      setAuthHeader();
      res.get(params, null, $scope.onSuccess,
          $scope.onError(res, params, null, doNotReattempt, $scope.getRequest));
    }

    $scope.deleteRequest = function(res, params, doNotReattempt) {
    setAuthHeader();
    res.delete(params, null, $scope.onSuccess,
        $scope.onError(res, params, null, doNotReattempt, $scope.deleteRequest));
    }

    $scope.saveRequest = function(res, params, requestJson, doNotReattempt) {
      setAuthHeader();
      res.save(params, requestJson, $scope.onSuccess,
          $scope.onError(res, params, requestJson, doNotReattempt, $scope.saveRequest));
    }

    $scope.updateRequest = function(res, params, requestJson, doNotReattempt) {
      setAuthHeader();
      res.update(params, requestJson, $scope.onSuccess,
          $scope.onError(res, params, requestJson, doNotReattempt, $scope.updateRequest));
    }

    // Following couple of methods use $http rather than $resource
    // Useful for making generic calls when the endpoint the user wants to hit is user entered
    $scope.makeRequest = function(requestUrl, method) {
      $http({method: method,
          url:$scope.apiurl + requestUrl,
          headers: {'Content-Type': 'application/x-www-form-urlencoded'}})
          .success(function (data, status, headers, config) {
              $scope.generalResponse = data;
          })
          .error(function (data, status, headers, config) {
              $scope.generalResponse = data;
          });
    };

    $scope.makeAuthorizedRequest = function(requestUrl, method, inputLoad, doNotReattempt) {
        if($scope.authResponse == undefined) {
            $scope.generalResponse = 'Access Token is required to make request';
        } else {
            $http({method: method,
                url:$scope.apiurl + requestUrl,
                data: inputLoad,
                withCredentials: true,
                headers: {'Authorization': 'Bearer ' + $scope.authResponse.accessToken}})
                .success(function (data, status, headers, config) {
                    $scope.generalResponse = data;
                })
                .error(function (data, status, headers, config) {
                    $scope.generalResponse = data;
                    var errorCode = $scope.generalResponse.errorCode;

                    // reattempt after refreshing token. Only do so once to make sure that we do not keep retrying
                    // also attempt only if it is an auth error and not anything else.
                    if(errorCode == '60001' && !doNotReattempt) {
                        // specifying callback to be called on success of refresh token retrieval
                        // the callback will attempt to make another request with new token values
                        $scope.authorizeWithRefreshToken(function() {
                            $scope.makeAuthorizedRequest(requestUrl, method, inputLoad, true);
                        });
                    }
                }
            );
        }
    };


}
