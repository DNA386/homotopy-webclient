import { _assert, isNatural, _propertylist } from "~/util/debug";
import * as ArrayUtil from "~/util/array";
import { Limit, Content, LimitComponent } from "~/limit";
import { Generator } from "~/generator";
import { Monotone } from "~/monotone";

export class Diagram {

  constructor(n, args) {
    this["_t"] = "Diagram";
    _assert(isNatural(n));
    this.n = n;
    if (n == 0) {
      _assert(args.type instanceof Generator);
      this.type = args.type;
    } else {
      _assert(args.source && (args.source.n + 1 == n));
      _assert(args.data instanceof Array);
      this.source = args.source;
      this.data = args.data;
      Object.freeze(this.data);
    }

    Object.freeze(this);
  }

  validate() {
    return true;
  }

  // The type of the object
  getType() {
    return "Diagram";
  }

  // Check if the diagram has any non-identity data up to the given height
  hasTopLevelContent(height = this.height) {
    for (let level = 0; level <= height; level++) {
      if (this.data[height] != null) {
        return true;
      }
    }

    return false;
  }

  get target() {
    if (this.n == 0) {
      return null;
    } else {
      return this.getSlice({
        height: this.data.length,
        regular: true
      });
    }
  }

  getSlice(...locations) {
    if (locations.length == 0) return this;

    _assert(this.n > 0);

    // Recursive case
    let pos = locations.shift();

    if (typeof(pos) === "number") {
      pos = Math.max(0, pos);
      pos = Math.min(this.data.length * 2, pos);
      pos = { height: Math.floor(pos / 2), regular: pos % 2 == 0 };
    }

    _assert(!isNaN(pos.height));
    _assert(pos.regular != undefined);

    if (locations.length > 0) {
      // No need to copy slice.
      return this.getSlice(pos).getSlice(...locations);
    }

    // Handle request for slice 1 of identity diagram gracefully
    if (pos.height == 1 && pos.regular && this.data.length == 0) {
      return this.source;
    }

    _assert((pos.regular && pos.height <= this.data.length) || (!pos.regular && pos.height < this.data.length));
    _assert(pos.height <= this.data.length);

    if (pos.height == 0 && pos.regular) return this.source;

    if (pos.regular) {
      let singular = this.getSlice({ height: pos.height - 1, regular: false });
      return this.data[pos.height - 1].backward_limit.rewrite_backward(singular);
    } else {
      let regular = this.getSlice({ height: pos.height, regular: true });
      return this.data[pos.height].forward_limit.rewrite_forward(regular);
    }
  }

  /**
   * Return the ways that the goal (up to goal_size) fits inside this diagram (up to max_height),
   * with match starting at the specified height, and including click_point if present
   */
  enumerate({
    goal,
    goal_size,
    start_height,
    max_height
  }) {
    _assert(this.n == goal.n);

    // Base case
    if (this.n == 0) {
      if (this.type == goal.type) {
        // Return a single trivial match
        return [[]]; 
      } else {
        // Return no matches
        return [];
      }
    }

    if (goal_size === undefined) goal_size = goal.data.length;

    if (max_height === undefined) max_height = this.data.length;

    // If this diagram is too short to yield a possible match, return empty
    if (start_height === undefined && max_height < goal_size) return [];

    if (start_height !== undefined && max_height < start_height + goal_size) return [];

    // The matches at least contain all the matches in the history of the diagram
    let matches = [];
    if (max_height > 0 && start_height == undefined) {
      matches = this.enumerate({ goal, goal_size, start_height, max_height: max_height - 1 });
    }

    // If goal_size == 0, we can try to find a match to a subslice
    if (goal_size == 0) {
      let slice_matches = this.getSlice({ height: max_height, regular: true })
        .enumerate({ goal: goal.source });

      for (let slice_match of slice_matches) {
        matches.push([max_height, ...slice_match]);
      }

      return matches;
    }

    // If goal_size > 0, we can try to extend a match of a smaller goal
    let new_matches = this.enumerate({
      goal,
      goal_size: goal_size - 1,
      start_height: max_height - goal_size,
      max_height: max_height - 1
    });

    for (let match of new_matches) {
      if (sub_content(this.data[max_height - 1], goal.data[goal_size - 1], match.slice(1))) {
        matches.push(match);
      }
    }

    return matches;
  }

  rewrite(data) {
    return data.backward_limit.rewrite_backward(data.forward_limit.rewrite_forward(this));
  }

  // Find the ID of the last cell that appears in the diagram
  getLastPoint() {
    if (this.n == 0) return this;
    if (this.data.length == 0) return this.source.getLastPoint();

    let k = this.data.length - 1;

    while (k > 0 && this.data[k].forward_limit.length + this.data[k].backward_limit.length == 0) {
      k--;
    }

    return this
      .getSlice({ height: k, regular: false })
      .getLastPoint();
  }

  // Get apparent wire depths for displaying homotopies
  getWireDepths(up, across) {
    let r1 = this.getSlice({ height: up, regular: true });
    let s = this.getSlice({ height: up, regular: false });
    //let limit_target = s.getSlice({ height: across, regular: false });
    let source_depths = Diagram.getLimitWireDepths(this.data[up].forward_limit, r1, s, across);
    let r2 = this.getSlice({ height: up + 1, regular: true });
    let target_depths = Diagram.getLimitWireDepths(this.data[up].backward_limit, r2, s, across);
    return { source_depths, target_depths };
  }

  static getLimitWireDepths(limit, source, target, singular_index) {
    let m = limit.getMonotone(source.data.length, target.data.length);
    let p = m.preimage(singular_index);
    let sublimit_target = target.getSlice({ height: singular_index, regular: false });
    let depths = [];
    for (let i = p.first; i < p.last; i++) {
      let n = source.data[i].getFirstSingularNeighbourhood();
      _assert(n != null);
      let sublimit = limit.subLimit(i);
      let sublimit_source = source.getSlice({ height: i, regular: false });
      let sublimit_mono = sublimit.getMonotone(sublimit_source.data.length, sublimit_target.data.length);
      depths.push(sublimit_mono[n]);
    }
    return depths;
  }

  /* Normalizes the diagram with respect to the given incoming limits.
   * Returns object with the following properties:
   *  - diagram, the normalized diagram;
   *  - embedding, a limit from the normalized diagram into the original diagram;
   *  - factorizations, limits into the normalized diagram that factorize the originally-provided
   *    limits through the embedding.
   */
  normalize(limits) {
    for (let i = 0; i < limits.length; i++) {
      let limit = limits[i];
      _assert(limit instanceof Limit);
      _assert(limit.n == this.n);
    }

    // Starting point is that all limits have themselves as the factorization
    let factorizations = limits.slice();

    // Base case: 0-diagrams always normalize to themselves.
    if (this.n == 0) {
      return { diagram: this, embedding: new Limit(0, []) };
    }

    // Recursive case
    let new_data = [];
    let new_components = [];
    for (let i = 0; i < this.data.length; i++) {

      // Obtain this singular slice
      let slice = this.getSlice({ regular: false, height: i });

      // List all the incoming limits
      let level_limits = [];
      let level_sublimits = [];
      let target_component_indices = [];
      for (let i = 0; i < limits.length; i++) {
        let limit = limits[i];
        let index = limit.getTargetComponentIndex(i);
        target_component_indices.push(index);
        let sublimits = index == null ? [] : limit[index].sublimits;
        level_limits = level_limits.concat(sublimits);
        level_sublimits.push(sublimits);
      }
      level_limits.push(this.data[i].forward_limit);
      level_limits.push(this.data[i].backward_limit);

      // Normalize this singular slice recursively
      let r = slice.normalize(level_limits);

      // Store the embedding data to build the final embedding limit
      if (r.embedding.length > 0) {
        //new_components.push(new LimitComponent()
      }
      new_sublimits.push(r.embedding);

      // Store the new data for the normalized diagram at this level
      let new_content = new Content(
        this.data[i].forward_limit.factorization,
        this.data[i].backward_limit.factorization);
      new_data.push(new_content);

      // Update the factorizations of the limits which have been passed in
      for (let j = 0; j < limits.length; j++) {
        let index = target_component_indices[j];
        if (index == null) continue; // this limit might not hit this singular level
        let limit = limits[j];
        let sublimits = limit.factorization[index].sublimits;

        for (let k = 0; k < sublimits.length; k++) {
          sublimits[k] = limit[index].sublimits[k].factorization;
          delete limit[index].sublimits[k].factorization; // don't need to store this any more
        }

        // if it's a forward limit, update the data about its target
        // ??????????????
        if (limit instanceof Limit /* WRONG!! */ ) {
          limit[index].data = [new_content.copy()];
        }
      }
    }

    // Build new diagram and its embedding
    let diagram = new Diagram(this.n, { data: new_data });

    // TODO: Here is a bug: new_components is not defined.
    let embedding = new Limit(this.n, new_components);

    // We might still have top-level bubbles, so adjust for this
    for (let i = 0; i < diagram.data.length; i++) {
      let content = diagram.data[i];
      if (content.forward_limit.length > 0 || content.backward_limit.length > 0) continue;

      // This level is a vacuum bubble. Let's check if it's in the image of an incoming limit.
      let in_image = false;
      for (let j = 0; j < limits.length; j++) {
        let index = limits[j].getTargetComponentIndex[i];
        if (index == null) continue;
        in_image = true;
        break;
      }
      
      if (in_image) continue;

      // We've found a vacuum bubble not in the image of any incoming limit, so remove it.
      diagram.data.splice(i, 1);
      embedding.removeSourceLevel(i); // not yet implemented
      for (let j = 0; j < limits.length; j++) {
        limits[j].factorization.removeTargetLevel(i); // not yet implemented
      }
      i--;
    }

    return { diagram, embedding };
  }

  // Typecheck this diagram
  typecheck() {
    for (let i = 0; i < this.data.length; i++) {
      if (!this.data[i].forward_limit.typecheck()) return false;
      if (!this.data[i].backward_limit.typecheck()) return false;
    }
    return true;
  }

  // Check if the specified id is used at all in this diagram
  usesCell(generator) {
    if (this.n == 0) return this.type.id == generator.id;
    if (this.source && this.source.usesCell(generator)) return true;
    for (let content of this.data) {
      if (content.usesCell(generator)) return true;
    }
    return false;
  }

  // Get the bounding box surrounding a diagram component
  getLocationBoundingBox(location) {
    _assert(this.n == location.length);

    if (this.n == 0) return { min: [], max: [] };
    if (location.length == 0) debugger;
    var box = this.getSliceBoundingBox(location);
    if (box == null) return null;
    var extra = (location.length > this.n ? location.slice(1) : location);
    box.min = box.min.concat(extra);
    box.max = box.max.concat(extra);
    if (extra.length == location.length) box.max[box.max.length - location.length]++;
    return box;
  }

  /**
   * Pad the diagram content to remain consistent with a higher source attachment.
   */
  pad(depth) {
    if (depth == 1) return;
    let source = this.source;
    let data = this.data.map(content => content.pad(depth - 1));
    return new Diagram(this.n, { source, data });
  }

  // Create the limit which contracts the a subdiagram at a given position, to a given type
  contractForwardLimit(type, position, subdiagram) {
    position = position || Array(this.n).fill(0);
    subdiagram = subdiagram || this;

    _assert(position.length == this.n);
    _assert(this.n == subdiagram.n);

    if (this.n == 0) {
      return new Limit(0, [new LimitComponent(0, { source_type: subdiagram.type, target_type: type })]);
    }

    let [height, ...rest] = position;
    let sublimits = [];
    for (let i = 0; i < subdiagram.data.length; i++) {
      let singular_slice = this.getSlice({ height: height + i, regular: false });
      let subdiagram_singular_slice = subdiagram.getSlice({ height: i, regular: false });
      sublimits.push(singular_slice.contractForwardLimit( type, rest, subdiagram_singular_slice ));
    }
    let source_first_limit = this.source.contractForwardLimit(type, rest, subdiagram.source );
    //let singular = source_first_limit.rewrite(this.source);

    let target = this.getSlice({ height: height + subdiagram.data.length, regular: true });

    let source_second_limit = target.contractForwardLimit(type, rest, subdiagram.target);

    let target_data = new Content(this.n - 1, source_first_limit, source_second_limit);
    //let source_data = subdiagram.data.slice(height, height + subdiagram.data.length);
    let source_data = this.data.slice(height, height + subdiagram.data.length);
    let limit_component = new LimitComponent(this.n, { first: height, source_data, target_data, sublimits });
    return new Limit(this.n, [limit_component], null);
  }

  // Create the limit which inflates the point at the given position, to a given subdiagram
  contractBackwardLimit(type, position, subdiagram) {
    position = position || Array(this.n).fill(0);
    subdiagram = subdiagram || this;

    _assert(position.length == this.n);
    _assert(this.n == subdiagram.n);

    if (this.n == 0) {
      let component = new LimitComponent(0, { source_type: subdiagram.type, target_type: this.type });
      return new Limit(0, [component]);
    }

    let [first, ...rest] = position;

    let sublimits = [];
    let singular_slice = this.getSlice({ height: position[0], regular: false });
    for (let i = 0; i < subdiagram.data.length; i++) {
      let subdiagram_singular_slice = subdiagram.getSlice({ height: i, regular: false });
      sublimits.push(singular_slice.contractBackwardLimit(type, rest, subdiagram_singular_slice));
    }

    let source_data = Content.deepPadData(subdiagram.data, rest);
    let target_data = this.data.slice(first, 1); // ??????

    let limit_component = new LimitComponent(this.n, { first, source_data, target_data, sublimits });
    return new Limit(this.n, [limit_component], null);
  }

  singularData() {
    if (this.n == 0) return this.type;
    let array = [];
    for (let i = 0; i < this.data.length; i++) {
      let slice_array = this
        .getSlice({ height: i, regular: false })
        .singularData();
      array.push(slice_array);
    }
    return array;
  }

  equals(d2) {
    var d1 = this;
    if (d1.n != d2.n) return false;
    if (d1.n == 0) return d1.type == d2.type;
    if (d1.data.length != d2.data.length) return false;
    for (var i = 0; i < this.data.length; i++) {
      if (!d1.data[i].equals(d2.data[i])) return false;
    }
    return d1.source.equals(d2.source);
  }

  // Produce the Content object that contracts a diagram
  contract(point, directions) {
    let location = point.map(x => ({ height: Math.floor(x / 2), regular: x % 2 == 0 }));

    let height = location[location.length - 1];

    _assert(!height.regular); // final entity must be at a singular height
    let slice = this.getSlice(...location.slice(0, location.length - 1)); // last coordinate is irrelevant

    if (directions[0] < 0 && height.height == 0) {
      throw "Can't perform homotopy off the bottom of the diagram.";
    }

    _assert(height.height < slice.data.length);

    if (directions[0] > 0 && height.height == slice.data.length - 1) {
      throw "Can't perform homotopy off the top of the diagram.";
    }

    if (directions[0] < 0) {
      location[location.length - 1].height--; // if we're dragging down, adjust for this
      if (directions[1] != null) directions[1] = -directions[1];
    }

    let right = directions[1];
    let forward_limit = this.getContractionLimit(location, right);
    let backward_limit = new Limit(this.n, []);
    return new Content(this.n, forward_limit, backward_limit);
  }

  // Produce the Content object that expands a diagram
  expand(point, directions) {
    let location = point.map(x => ({ height: Math.floor(x / 2), regular: x % 2 == 0 }));
    //throw "not yet implemented";
    let backward_limit = this.getExpansionLimit(location, directions[1] == 1);
    let forward_limit = new Limit(this.n, []);
    return new Content(this.n, forward_limit, backward_limit);
  }

  // Recursive procedure constructing a BackwardsLimit object that expands a diagram at a given position
  getExpansionLimit(location, up) {
    _assert(location instanceof Array);
    _assert(location.length >= 2); // Expansion requires at least 2 coordinates
    if (location.length == 2) {
      // Expansion base case
      _assert(!location[0].regular && !location[1].regular); // both coordinates must be singular
      let r1 = this.getSlice({ height: location[0].height, regular: true });
      let r2 = this.getSlice({ height: location[0].height + 1, regular: true });
      let s = this.getSlice({ height: location[0].height, regular: false });
      let first = location[0].height;
      let target_data = this.data[first];
      if (up) {
        let expansion = target_data.getExpansionData(location[1].height, r1, r2, s);
        let component = new LimitComponent(this.n, { source_data: expansion.data, target_data, sublimits: expansion.sublimits, first });
        return new Limit(this.n, [component]);
      } else {
        let reverse_content = target_data.reverse();
        let reverse_expansion = reverse_content.getExpansionData(location[1].height, r2, r1, s);
        let data_0_rev = reverse_expansion.data[0].reverse(r2);
        let new_regular_slice = reverse_expansion.data[0].rewrite_backward(r2);
        let data_1_rev = reverse_expansion.data[1].reverse(new_regular_slice);
        let source_data = [data_1_rev, data_0_rev];
        let sublimits = reverse_expansion.sublimits.reverse();
        let component = new LimitComponent(this.n, { source_data, target_data, sublimits, first });
        return new Limit(this.n, [component]);
      }
    } else if (location[0].regular) {
      throw "cannot perform expansion on regular slice";
    } else {
      throw "not yet implemented recursive expansion on singular slices";
    }
  }

  // Recursive procedure that constructs a limit contracting a diagram at a given position
  getContractionLimit(location, right) {
    _assert(location instanceof Array);
    _assert(location.length >= 1); // Contraction requires at least 1 coordinate
    let height = location[0].height;
    _assert(!isNaN(height));

    if (location.length == 1) {

      // Contraction base case
      _assert(!location[0].regular); // The UI should never trigger contraction from a regular slice
      _assert(height >= 0);
      _assert(height < this.data.length - 1);
      let regular = this.getSlice({ height: height + 1, regular: true });
      let D1 = this.getSlice({ height, regular: false });
      let D2 = this.getSlice({ height: height + 1, regular: false });
      let L1 = this.data[height].backward_limit;
      let L2 = this.data[height + 1].forward_limit;
      let upper = [D1, D2];
      let lower = [{ diagram: regular, left_index: 0, right_index: 1, left_limit: L1, right_limit: L2, bias: right == 1 /* true means right, false means left, null means none */ }];
      let contract_data = Diagram.multiUnify({ lower, upper, right: right == 1 });

      // Build the limit to the contracted diagram
      let first = location[0].height;
      let sublimits = contract_data.limits;
      let data_forward = sublimits[0].compose(this.data[height].forward_limit);
      let data_backward = sublimits[1].compose(this.data[height + 1].backward_limit);
      let target_data = new Content(this.n - 1, data_forward, data_backward);
      let source_data = this.slice(first, first + 2);
      let forward_component = new LimitComponent(this.n, { first, source_data, target_data, sublimits });
      return new Limit(this.n, [forward_component]);

    } else if (location.length > 1) {

      // Recursive case
      let slice = this.getSlice(location[0]);
      let recursive = slice.getContractionLimit(location.slice(1), right);
      let first = height;

      if (location[0].regular) {

        // Contraction recursive case on regular slice: insert bubble.
        let target_data = [new Content(this.n - 1, recursive, recursive)];
        let component = new LimitComponent(this.n, { source_data: [], target_data, first, sublimits: [] });
        return new Limit(this.n, [component]);

      } else {

        // Contraction recursive case on singular slice: postcompose.
        let forward_first = this.data[height].forward_limit;
        let backward_first = this.data[height].backward_limit;
        let new_forward = recursive.compose(forward_first);
        let new_backward = recursive.compose(backward_first);
        let target_data = new Content(this.n - 1, new_forward, new_backward);
        let source_data = this.data.slice(height, height + 1);
        let component = new LimitComponent(this.n, { source_data, target_data, first, sublimits: [recursive] });
        return new Limit(this.n, [component]);
      }
    }
    _assert(false);
  }

  // Compute a simultaneous unification of monotones
  static multiUnify({ lower, upper, depth }) {

    let n = upper[0].n;
    for (let i = 0; i < upper.length; i++) {
      _assert(upper[i] instanceof Diagram);
      _assert(upper[i].n == n);
    }

    for (let i = 0; i < lower.length; i++) {
      _propertylist(lower[i], ["left_index", "left_limit", "right_index", "right_limit", "diagram"], ["bias"]);
      _assert(lower[i].diagram instanceof Diagram && lower[i].left_limit instanceof Limit && lower[i].right_limit instanceof Limit);
      _assert(isNatural(lower[i].left_index) && isNatural(lower[i].right_index));
      _assert(lower[i].left_index < upper.length && lower[i].right_index < upper.length);
      _assert(lower[i].diagram.n == n && lower[i].left_limit.n == n && lower[i].right_limit.n == n);
    }

    _assert(depth == null || isNatural(depth));
    _assert(upper.length > 0); // doesn't make sense to pushout no families (?)

    // Base case
    if (n == 0) {

      // Tabulate the top-dimensional types that appear
      let top_types = [];
      for (let i = 0; i < upper.length; i++) Diagram.updateTopTypes(top_types, upper[i].type);
      for (let i = 0; i < lower.length; i++) Diagram.updateTopTypes(top_types, lower[i].diagram.type);

      // If there's more than one top-dimensional type, throw an error
      _assert(top_types.length > 0);
      if (top_types.length > 1) throw "no unification, multiple top types in base case";
      let type = top_types[0];

      // Return the final data
      let target = new Diagram(0, { type });
      return { limits, target };
    }

    // Get the unification of the singular monotones
    let m_upper = [];
    for (let i = 0; i < upper.length; i++) {
      m_upper[i] = upper[i].data.length;
    }
    let m_lower = [];
    for (let i = 0; i < lower.length; i++) {
      let m_left = lower[i].left_limit.getMonotone(lower[i].diagram, upper[lower[i].left_index]);
      let left = { target: lower[i].left_index, monotone: m_left };
      let m_right = lower[i].right_limit.getMonotone(lower[i].diagram, upper[lower[i].right_index]);
      let right = { target: lower[i].right_index, monotone: m_right };
      let bias = lower[i].bias;
      m_lower.push({ left, right, bias });
    }
    let m_unif = Monotone.multiUnify({ lower: m_lower, upper: m_upper });

    // Find size of unification set
    let target_size = m_unif[0].target_size;

    // For each element of unification set, recursively unify
    let limit_components = [];
    for (let i = 0; i < upper.length; i++) limit_components[i] = [];
    let target_content = [];
    for (let i = 0; i < target_size; i++) {
      let component = Diagram.multiUnifyComponent({ upper, lower }, m_unif, m_lower, i);
      target_content.push(component.target_content);
      for (let j = 0; j < upper.length; j++) {
        if (!component.cocone_components[j]) continue;
        limit_components[j].push(component.cocone_components[j]);
      }
    }

    // Build final data
    let target = new Diagram(n, { source: upper[0].source, data: target_content });
    let limits = [];
    for (let i = 0; i < upper.length; i++) {
      limits.push(new Limit(n, limit_components[i]));
    }

    // Return final data
    return { limits, target };
  }

  static updateTopTypes(top_types, type) {
    if (top_types.indexOf(type) >= 0) return; // type already in list
    if (top_types.length == 0 || type.n == top_types[0].n) {
      top_types.push(type);
      return;
    }
    if (type.n < top_types[0].n) return;
    _assert(type.n > top_types[0].n);
    top_types.length = 0;
    top_types.push(type);
  }

  static updateTypes(types, type) {
    _assert(type instanceof Generator);
    _assert(types.type1 != types.type2 || (types.type1 == null && types.type2 == null));
    if (types.type1 != null && types.type2 != null) _assert(types.type1.n < types.type2.n);
    if (types.type2 != null) _assert(types.type1 != null);
    if (types.type1 == type || types.type2 == type) return;
    if (types.type1 == null) types.type1 = type;
    else if (types.type2 == null) types.type2 = type;
    else throw "inconsistent types";
    if (types.type1 != null && types.type2 != null && types.type1.n > types.type2.n) {
      [types.type1, types.type2] = [types.type2, types.type1];
    }
  }

  static multiUnifyComponent({ upper, lower }, m_cocone, m_lower, height) {

    // Restrict upper, lower to the appropriate heights
    let upper_preimage = [];
    let lower_preimage = [];
    let upper_ranges = [];
    let lower_ranges = [];
    for (let i = 0; i < upper.length; i++) {
      upper_ranges[i] = m_cocone[i].preimage(height);
      upper_preimage.push(upper[i].restrict(upper_ranges[i]));
    }
    for (let i = 0; i < lower.length; i++) {
      let l = lower[i];
      let left_index = l.left_index;
      let right_index = l.right_index;

      let left_limit = l.left_limit.preimage(upper_ranges[left_index]);
      let right_limit = l.right_limit.preimage(upper_ranges[right_index]);
      let left_monotone = l.left_limit.getMonotone(l.diagram.data.length, upper[l.left_index].data.length);
      let left_preimage = left_monotone.preimage(upper_ranges[l.left_index]);
      lower_ranges.push(left_preimage);
      let diagram = l.diagram.restrict(left_preimage);
      lower_preimage.push({ left_index, right_index, left_limit, right_limit, diagram });
    }

    // Explode the upper singular and regular diagrams
    let upper_exploded = [];
    let lower_exploded = [];
    let upper_slice_position = [];
    for (let i = 0; i < upper.length; i++) {
      let u = upper_preimage[i];
      let slice_positions = [];
      for (let j = 0; j < u.data.length; j++) {
        slice_positions.push(upper_exploded.length);
        upper_exploded.push(u.getSlice({ height: j, regular: false }));
        if (j == 0) continue; // one less regular level than singular level to include
        let diagram = u.getSlice({ height: j, regular: true });
        let left_limit = u.data[j - 1].backward_limit;
        let right_limit = u.data[j].forward_limit;
        let left_index = upper_exploded.length - 2;
        let right_index = upper_exploded.length - 1;
        lower_exploded.push({ diagram, left_limit, right_limit, left_index, right_index });
      }
      upper_slice_position.push(slice_positions);
    }

    // Extract the lower singular diagrams
    for (let i = 0; i < lower.length; i++) {
      let l = lower_preimage[i];
      for (let j = 0; j < l.diagram.data.length; j++) {
        let diagram = l.diagram.getSlice({ height: j, regular: false }); 
        let left_limit = l.left_limit.subLimit(j);
        let right_limit = l.right_limit.subLimit(j);
        let lower_offset = lower_ranges[i].first;
        let upper_right_offset = upper_ranges[l.right_index].first;
        let upper_left_offset = upper_ranges[l.left_index].first;
        let left_index = upper_slice_position[l.left_index][m_lower[i].left.monotone[j + lower_offset] - upper_left_offset];
        let right_index = upper_slice_position[l.right_index][m_lower[i].right.monotone[j + lower_offset] - upper_right_offset];
        lower_exploded.push({ diagram, left_limit, right_limit, left_index, right_index });
      }
    }
    let exploded = { upper: upper_exploded, lower: lower_exploded };
    _assert(upper_exploded.length > 0);
    let nonempty_upper = null;
    for (let i = 0; i < upper.length; i++) {
      if (upper_preimage[i].data.length > 0) {
        nonempty_upper = i;
        break;
      }
    }

    _assert(nonempty_upper != null);

    // Recursively unify
    let recursive = Diagram.multiUnify(exploded);

    // Get the content for the main diagram
    let nu = upper[nonempty_upper];
    let recursive_first = recursive.limits[upper_slice_position[nonempty_upper][0]];
    let forward = recursive_first.compose(nu.data[upper_ranges[nonempty_upper].first].forward_limit);
    let last_slice_position = ArrayUtil.last(upper_slice_position[nonempty_upper]);
    let recursive_last = recursive.limits[last_slice_position];
    let backward = recursive_last.compose(nu.data[upper_ranges[nonempty_upper].last - 1].backward_limit);
    let target_data = new Content(nu.n - 1, forward, backward);

    // Get the cocone components as forward limits
    let cocone_components = [];
    for (let i = 0; i < upper.length; i++) {
      let first = upper_ranges[i].first;
      let last = upper_ranges[i].last;
      let sublimits = [];
      for (let j = first; j < last; j++) {
        let sublimit = recursive.limits[upper_slice_position[i][j - first]];
        sublimits.push(sublimit);
      }
      if (sublimits.length == 1 && sublimits[0].length == 0) {
        cocone_components[i] = null;
      } else {
        let source_data = upper_preimage[i].data.slice();
        cocone_components[i] = new LimitComponent(upper[0].n, { first, source_data, target_data, sublimits });
      }
    }

    return { target_content, cocone_components };
  }

  restrict(range) {
    let source = this.getSlice({
      height: range.first,
      regular: true
    });
    let data = [];
    for (let i = range.first; i < range.last; i++) {
      data.push(this.data[i].copy());
    }
    let n = this.n;
    return new Diagram(n, {
      source,
      data
    });
  }

  // Turns an n-diagram into an identity (n+1)-diagram
  boost() {
    return new Diagram(this.n + 1, { source: this, data: [] });
  }
}

function sub_content(content, subcontent, position) {
  if (!sub_limit(content.forward_limit, subcontent.forward_limit, position)) return false;
  if (!sub_limit(content.backward_limit, subcontent.backward_limit, position)) return false;
  return true;
}

// Check if the given subdata is present with the indicated offset
function sub_data(data, subdata, offset) {
  //    if (!sub_limit(this.data[height].forward_limit, subdata.forward_limit, offset)) return false;
  //    if (!sub_limit(this.data[height].backward_limit, subdata.backward_limit, offset)) return false;
  if (!sub_limit(data.forward_limit, subdata.forward_limit, offset)) return false;
  if (!sub_limit(data.backward_limit, subdata.backward_limit, offset)) return false;
  return true;
}

// Check if a forward limit contains all the content of another
function sub_limit(limit, sublimit, offset) {
  _assert(limit.n == sublimit.n);
  if (limit.length != sublimit.length) return false; // number of components must be the same
  for (let i = 0; i < limit.length; i++) {
    if (!sub_limit_component(limit[i], sublimit[i], offset)) return false;
  }
  return true;
}

function sub_limit_component(component, subcomponent, offset) {
  _assert(component.n == subcomponent.n);
  _assert(offset.length == component.n);
  if (component.n == 0) return component.type == subcomponent.type;
  if (component.first != subcomponent.first + offset[0]) return false;
  if (component.last != subcomponent.last + offset[0]) return false;
  if (component.data.length != subcomponent.data.length) return false;
  let offset_slice = offset.slice(1);
  for (let i = 0; i < component.data.length; i++) {
    if (!sub_data(component.data[i], subcomponent.data[i], offset_slice)) return false;
  }
  if (component.sublimits.length != subcomponent.sublimits.length) return false;
  for (let i = 0; i < component.sublimits.length; i++) {
    if (!sub_limit(component.sublimits[i], subcomponent.sublimits[i], offset_slice)) return false;
  }
  return true;
}

// Make a new copy of a limit
function copy_limit(old_limit) {
  if (old_limit == null) return null;
  let new_limit = [];
  for (let i = 0; i < old_limit.length; i++) {
    let x = old_limit[i];
    let entry = {};
    entry.data = copy_data(x.data);
    entry.first = x.first;
    entry.last = x.last;
    entry.data = copy_limit(o.data);
  }
}
